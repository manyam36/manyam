begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.schools (
  udise text primary key, name text not null, mandal text not null,
  "mandalCode" text not null default '', unique (udise, mandal)
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null check (length(trim(name)) between 1 and 100),
  "displayName" text not null,
  role text not null check (role in ('DEO', 'MEO', 'PD', 'PET')),
  mandal text not null, "mandalCode" text not null default '',
  "schoolUdise" text not null, "schoolName" text not null,
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "createdBy" uuid references auth.users(id) on delete set null,
  "updatedAt" timestamptz,
  check ((role = 'DEO' and mandal = 'ALL' and "schoolUdise" = 'ALL')
    or (role = 'MEO' and mandal <> 'ALL' and "schoolUdise" = 'ALL')
    or (role in ('PD', 'PET') and mandal <> 'ALL' and "schoolUdise" <> 'ALL'))
);
create table public.students (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(trim(name)) between 1 and 200), pen text not null default '',
  "className" text not null check ("className" in ('6', '7', '8', '9', '10')),
  gender text not null default '' check (gender in ('', 'Male', 'Female', 'Other')),
  dob date, "schoolUdise" text not null, "schoolName" text not null,
  mandal text not null, "mandalCode" text not null default '',
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "createdBy" uuid not null references auth.users(id),
  foreign key ("schoolUdise", mandal) references public.schools(udise, mandal),
  unique (id, "schoolUdise", mandal)
);
create table public.fitness_tests (
  id text primary key default gen_random_uuid()::text,
  "studentId" text not null, "studentName" text not null, pen text not null default '',
  "className" text not null, gender text not null default '',
  "schoolUdise" text not null, "schoolName" text not null,
  mandal text not null, "mandalCode" text not null default '', "testDate" date not null,
  "heightCm" numeric check ("heightCm" >= 0),
  "weightKg" numeric check ("weightKg" >= 0),
  bmi numeric generated always as (case when "heightCm" > 0 and "weightKg" > 0 then round("weightKg" / (("heightCm" / 100) ^ 2), 2) end) stored,
  "run50mSec" numeric check ("run50mSec" >= 0),
  "run600mSec" numeric check ("run600mSec" >= 0),
  "standingBroadJumpCm" numeric check ("standingBroadJumpCm" >= 0),
  "sitAndReachCm" numeric check ("sitAndReachCm" >= 0),
  "shuttleRunSec" numeric check ("shuttleRunSec" >= 0),
  remarks text not null default '' check (length(remarks) <= 1000),
  "createdAt" timestamptz not null default now(),
  "createdBy" uuid not null references auth.users(id),
  foreign key ("studentId", "schoolUdise", mandal) references public.students(id, "schoolUdise", mandal),
  check (num_nonnulls("heightCm", "weightKg", "run50mSec", "run600mSec", "standingBroadJumpCm", "sitAndReachCm", "shuttleRunSec") > 0)
);
create index profiles_scope_idx on public.profiles (role, mandal, "schoolUdise") where active;
create index schools_mandal_idx on public.schools (mandal);
create index students_school_idx on public.students ("schoolUdise", mandal);
create index students_mandal_idx on public.students (mandal);
create index fitness_scope_idx on public.fitness_tests ("schoolUdise", mandal);
create index fitness_mandal_idx on public.fitness_tests (mandal);
create index fitness_student_idx on public.fitness_tests ("studentId");
create index fitness_date_idx on public.fitness_tests ("testDate");

-- Read live profiles, never user-editable Auth metadata. Definer avoids RLS recursion.
create function private.is_deo() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active and role = 'DEO');
$$;
create function private.can_read(target_mandal text, target_school text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active and
    (role = 'DEO' or (role = 'MEO' and mandal = target_mandal)
      or (role in ('PD','PET') and mandal = target_mandal and "schoolUdise" = target_school)));
$$;
create function private.can_write(target_mandal text, target_school text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active and
    (role = 'DEO' or (role in ('PD','PET') and mandal = target_mandal and "schoolUdise" = target_school)));
$$;
revoke all on function private.is_deo() from public;
revoke all on function private.can_read(text,text) from public;
revoke all on function private.can_write(text,text) from public;
grant execute on function private.is_deo(), private.can_read(text,text), private.can_write(text,text) to authenticated;

-- Derive labels and scope from their referenced records, rather than client values.
create function private.fill_student_school() returns trigger language plpgsql set search_path = '' as $$
declare school public.schools;
begin
  select * into strict school from public.schools where udise = new."schoolUdise";
  new.mandal := school.mandal; new."schoolName" := school.name; new."mandalCode" := school."mandalCode";
  return new;
end;
$$;
create trigger students_school before insert or update on public.students for each row execute function private.fill_student_school();
create function private.fill_assessment_student() returns trigger language plpgsql set search_path = '' as $$
declare student public.students;
begin
  select * into strict student from public.students where id = new."studentId";
  new."studentName" := student.name; new.pen := student.pen; new."className" := student."className";
  new.gender := student.gender; new."schoolUdise" := student."schoolUdise";
  new."schoolName" := student."schoolName"; new.mandal := student.mandal; new."mandalCode" := student."mandalCode";
  return new;
end;
$$;
create trigger fitness_student before insert or update on public.fitness_tests for each row execute function private.fill_assessment_student();
revoke all on function private.fill_student_school(), private.fill_assessment_student() from public;
create function private.keep_creation_fields() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new."createdBy" is distinct from old."createdBy" or new."createdAt" is distinct from old."createdAt" then
    raise exception 'Creation fields cannot be changed';
  end if;
  return new;
end;
$$;
create trigger students_creation before update on public.students for each row execute function private.keep_creation_fields();
create trigger fitness_creation before update on public.fitness_tests for each row execute function private.keep_creation_fields();
revoke all on function private.keep_creation_fields() from public;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.fitness_tests enable row level security;
revoke all on public.schools, public.profiles, public.students, public.fitness_tests from anon, authenticated;
grant select on public.schools, public.profiles to authenticated;
grant select, insert, update, delete on public.students, public.fitness_tests to authenticated;
grant all on public.schools, public.profiles, public.students, public.fitness_tests to service_role;
create policy profile_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select private.is_deo()));
create policy school_read on public.schools for select to authenticated using (private.can_read(mandal, udise));
create policy student_read on public.students for select to authenticated using (private.can_read(mandal, "schoolUdise"));
create policy student_insert on public.students for insert to authenticated with check ("createdBy" = (select auth.uid()) and private.can_write(mandal, "schoolUdise"));
create policy student_update on public.students for update to authenticated using (private.can_write(mandal, "schoolUdise")) with check (private.can_write(mandal, "schoolUdise"));
create policy student_delete on public.students for delete to authenticated using ((select private.is_deo()));
create policy fitness_read on public.fitness_tests for select to authenticated using (private.can_read(mandal, "schoolUdise"));
create policy fitness_insert on public.fitness_tests for insert to authenticated with check ("createdBy" = (select auth.uid()) and private.can_write(mandal, "schoolUdise"));
create policy fitness_update on public.fitness_tests for update to authenticated using (private.can_write(mandal, "schoolUdise")) with check (private.can_write(mandal, "schoolUdise"));
create policy fitness_delete on public.fitness_tests for delete to authenticated using ((select private.is_deo()));
commit;

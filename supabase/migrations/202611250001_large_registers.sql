begin;
create index if not exists fitness_recent_idx on public.fitness_tests ("testDate" desc,id desc);
create index if not exists students_school_pen_idx on public.students ("schoolUdise",pen);

-- SECURITY INVOKER preserves the caller's live profile and existing RLS policies.
create function public.dashboard_summary() returns jsonb language sql stable security invoker set search_path='' as $$
  with student_counts as (
    select "schoolUdise",count(*) as students from public.students group by "schoolUdise"
  ), test_counts as (
    select "schoolUdise",count(*) as tests,count(distinct "studentId") as assessed,
      sum(bmi) filter(where bmi>0) as bmi_sum,count(*) filter(where bmi>0) as bmi_count
    from public.fitness_tests group by "schoolUdise"
  ), counts as (
    select s.udise,coalesce(st.students,0) as students,coalesce(t.tests,0) as tests,
      coalesce(t.assessed,0) as assessed,coalesce(t.bmi_sum,0) as bmi_sum,coalesce(t.bmi_count,0) as bmi_count
    from public.schools s left join student_counts st on st."schoolUdise"=s.udise left join test_counts t on t."schoolUdise"=s.udise
  ) select jsonb_build_object(
    'students',coalesce(sum(students),0),'tests',coalesce(sum(tests),0),'assessed',coalesce(sum(assessed),0),
    'averageBMI',round(sum(bmi_sum)/nullif(sum(bmi_count),0),2),
    'bySchool',coalesce(jsonb_object_agg(udise,jsonb_build_object('students',students,'tests',tests,'assessed',assessed)),'{}'::jsonb),
    'gender',coalesce((select jsonb_object_agg(gender,total) from (select gender,count(*) total from public.fitness_tests group by gender) g),'{}'::jsonb),
    'recent',coalesce((select jsonb_agg(to_jsonb(r) order by r."testDate" desc,r.id desc) from
      (select id,"studentName","schoolName","testDate",bmi from public.fitness_tests order by "testDate" desc,id desc limit 8) r),'[]'::jsonb)
  ) from counts;
$$;

create function public.student_page(p_search text default '',p_page integer default 1,p_size integer default 100)
returns jsonb language sql stable security invoker set search_path='' as $$
  with parameters as (
    select greatest(1,coalesce(p_page,1)) as page,least(100,greatest(1,coalesce(p_size,100))) as size,
      '%'||replace(replace(replace(left(trim(coalesce(p_search,'')),200),'\','\\'),'%','\%'),'_','\_')||'%' as pattern
  ), matching as (
    select s.* from public.students s,parameters p where
      s.name ilike p.pattern or s.pen ilike p.pattern or s."schoolName" ilike p.pattern or s."schoolUdise" ilike p.pattern
  ), totals as (select count(*) as total from matching), paging as (
    select t.total,p.size,least(p.page,greatest(1,ceil(t.total::numeric/p.size)::integer)) as page from totals t,parameters p
  ), records as (
    select * from matching order by id limit (select size from paging) offset (select (page::bigint-1)*size from paging)
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from records r),'[]'::jsonb),
    'total',total,'page',page,'pageSize',size) from paging;
$$;

create function public.fitness_page(p_search text default '',p_page integer default 1,p_size integer default 50)
returns jsonb language sql stable security invoker set search_path='' as $$
  with parameters as (
    select greatest(1,coalesce(p_page,1)) as page,least(100,greatest(1,coalesce(p_size,50))) as size,
      '%'||replace(replace(replace(left(trim(coalesce(p_search,'')),200),'\','\\'),'%','\%'),'_','\_')||'%' as pattern
  ), matching as (
    select t.* from public.fitness_tests t,parameters p where
      t."studentName" ilike p.pattern or t.pen ilike p.pattern or t."schoolName" ilike p.pattern or t."schoolUdise" ilike p.pattern or t.mandal ilike p.pattern
  ), totals as (select count(*) as total from matching), paging as (
    select t.total,p.size,least(p.page,greatest(1,ceil(t.total::numeric/p.size)::integer)) as page from totals t,parameters p
  ), records as (
    select * from matching order by "testDate" desc,id desc limit (select size from paging) offset (select (page::bigint-1)*size from paging)
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r) order by r."testDate" desc,r.id desc) from records r),'[]'::jsonb),
    'total',total,'page',page,'pageSize',size) from paging;
$$;

create function public.match_students(p_identifiers jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if jsonb_typeof(p_identifiers)<>'array' or jsonb_array_length(p_identifiers)>450 then raise exception 'Supply up to 450 student identifiers.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('index',i.ordinality-1,'student',to_jsonb(s)))
    from jsonb_array_elements(p_identifiers) with ordinality i(value,ordinality)
    join public.students s on
      (nullif(i.value->>'studentId','') is not null and s.id=i.value->>'studentId')
      or (nullif(i.value->>'studentId','') is null and nullif(i.value->>'pen','') is not null and
        nullif(i.value->>'schoolUdise','') is not null and s.pen=i.value->>'pen' and s."schoolUdise"=i.value->>'schoolUdise')),'[]'::jsonb);
end;
$$;
revoke all on function public.dashboard_summary(),public.student_page(text,integer,integer),public.fitness_page(text,integer,integer),public.match_students(jsonb) from public,anon;
grant execute on function public.dashboard_summary(),public.student_page(text,integer,integer),public.fitness_page(text,integer,integer),public.match_students(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

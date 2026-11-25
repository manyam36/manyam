// Page through records explicitly: Supabase returns at most 1,000 by default.
export function createDataApi(client) {
  async function rpc(name,args={}){
    const {data,error}=await client.rpc(name,args);
    if(error)throw new Error(error.message);
    return data;
  }
  return {
    summary:()=>rpc('dashboard_summary'),
    studentPage:({search='',page=1,pageSize=100}={})=>rpc('student_page',{p_search:search,p_page:page,p_size:pageSize}),
    fitnessPage:({search='',page=1,pageSize=50}={})=>rpc('fitness_page',{p_search:search,p_page:page,p_size:pageSize}),
    matchStudents:identifiers=>rpc('match_students',{p_identifiers:identifiers}),
    async list(table, filters = {}) {
      const key = table === 'schools' ? 'udise' : 'id';
      const rows = [];
      let cursor;
      for (;;) {
        let request = client.from(table).select('*').order(key).range(0, 499);
        for (const [column, value] of Object.entries(filters)) request = request.eq(column, value);
        if (cursor !== undefined) request = request.gt(key, cursor);
        const { data, error } = await request;
        if (error) throw new Error(error.message);
        const page = data || [];
        rows.push(...page.map(row => table === 'schools' ? { ...row, id: row.udise } : row));
        if (page.length < 500) return rows;
        const next = page.at(-1)[key];
        if (next === undefined || next === cursor) throw new Error('Database pagination did not advance.');
        cursor = next;
      }
    },
    async profile(uid) {
      const { data, error } = await client.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async insert(table, payload) {
      const { error } = await client.from(table).insert(payload);
      if (error) throw new Error(error.message);
    }
  };
}

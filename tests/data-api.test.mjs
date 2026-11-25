import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataApi } from '../data-api.mjs';

test('fetches all 10,000 students with stable cursors and scope filters',async()=>{
  const all=Array.from({length:10000},(_,i)=>({id:String(i).padStart(5,'0'),mandal:'BHAMINI'}));
  let calls=0;
  const client={from(table){
    assert.equal(table,'students');calls++;
    let cursor, filters={};
    const query={select(){return this;},order(key){assert.equal(key,'id');return this;},range(from,to){assert.equal(from,0);assert.equal(to,499);return this;},eq(key,value){filters[key]=value;return this;},gt(key,value){assert.equal(key,'id');cursor=value;return this;},then(resolve){assert.deepEqual(filters,{mandal:'BHAMINI'});return Promise.resolve({data:all.filter(row=>cursor===undefined||row.id>cursor).slice(0,500),error:null}).then(resolve);}};
    return query;
  }};
  assert.deepEqual(await createDataApi(client).list('students',{mandal:'BHAMINI'}),all);
  assert.equal(calls,21);
});
test('database errors do not silently produce partial registers',async()=>{
  const request={select(){return this;},order(){return this;},range(){return this;},then(resolve){return Promise.resolve({data:null,error:{message:'Access denied'}}).then(resolve);}};
  await assert.rejects(createDataApi({from(){return request;}}).list('students'),/Access denied/);
});

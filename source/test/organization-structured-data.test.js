import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoreOrganizationStructuredData, serializeJsonLdSafely } from '../src/organization-structured-data.js';
const legal={legalName:'Company BV',storeName:'Modern Store',businessAddress:'Brussels, Belgium',supportEmail:'help@example.com',businessPhone:'+32 2 555 0100',enterpriseNumber:'0123.456.789',vatNumber:'BE0123456789',baseUrl:'https://shop.example/'};
test('verified merchant business fields become honest structured data',()=>{
 const data=buildStoreOrganizationStructuredData(legal);
 assert.equal(data['@type'],'Organization');
 assert.equal(data.name,'Company BV');
 assert.equal(data.alternateName,'Modern Store');
 assert.equal(data.vatID,'BE0123456789');
 assert.equal(data.url,'https://shop.example/');
});
test('no invented tax number, partial identity or insecure URL is published',()=>{
 assert.equal(buildStoreOrganizationStructuredData({...legal,legalName:''}),null);
 assert.equal(buildStoreOrganizationStructuredData({...legal,businessAddress:''}),null);
 assert.equal(buildStoreOrganizationStructuredData({...legal,baseUrl:'http://shop.example/'}),null);
 const data=buildStoreOrganizationStructuredData({...legal,vatNumber:'',enterpriseNumber:''});
 assert.equal(Object.hasOwn(data,'vatID'),false);
 assert.equal(Object.hasOwn(data,'taxID'),false);
});
test('structured JSON-LD cannot inject a closing script element',()=>{
 const data=buildStoreOrganizationStructuredData({...legal,storeName:'</script><script>alert(1)</script>'});
 const json=serializeJsonLdSafely(data);
 assert.equal(json.includes('</script>'),false);
 assert.equal(JSON.parse(json).alternateName,'</script><script>alert(1)</script>');
});

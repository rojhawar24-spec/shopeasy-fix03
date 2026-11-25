import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductStructuredData } from '../src/product-structured-data.js';

const product={name:'Test Shoe',sku:'SHOE-PARENT',short_description:'Simple shoe',description:'A test shoe.'};
const common={product,productUrl:'https://shop.example/product/test-shoe',currency:'EUR',price:'59.90',imageUrl:'https://shop.example/image.webp',available:true};

test('supported size options build a server-rendered ProductGroup with distinct variant SKUs, URLs and inventory',()=>{
  const schema=buildProductStructuredData({...common,variants:[
    {id:11,sku:'VAR-11-ABC',option_name:'Size',option_value:'42',available_stock:3},
    {id:12,sku:'VAR-12-DEF',option_name:'Size',option_value:'43',available_stock:0}
  ]});
  assert.equal(schema['@type'],'ProductGroup');
  assert.deepEqual(schema.variesBy,['https://schema.org/size']);
  assert.equal(schema.productGroupID,'SHOE-PARENT');
  assert.equal(schema.hasVariant[0].sku,'VAR-11-ABC');
  assert.equal(schema.hasVariant[0].size,'42');
  assert.equal(schema.hasVariant[0].offers.url,'https://shop.example/product/test-shoe?variant=11');
  assert.equal(schema.hasVariant[0].offers.availability,'https://schema.org/InStock');
  assert.equal(schema.hasVariant[1].offers.availability,'https://schema.org/OutOfStock');
});

test('colour names map to the supported Schema.org color property',()=>{
  const schema=buildProductStructuredData({...common,variants:[{id:21,sku:'VAR-COLOR-21',option_name:'Colour',option_value:'Blue',available_stock:2}]});
  assert.equal(schema['@type'],'ProductGroup');
  assert.equal(schema.hasVariant[0].color,'Blue');
});

test('unsupported custom option types keep honest regular Product markup',()=>{
  const schema=buildProductStructuredData({...common,variants:[{id:31,sku:'VAR-SCENT-31',option_name:'Fragrance',option_value:'Rose',available_stock:2}]});
  assert.equal(schema['@type'],'Product');
  assert.equal(schema.offers.price,'59.90');
  assert.equal('hasVariant' in schema,false);
});


test('colour × size matrix is emitted as one ProductGroup with both supported properties and per-variant images',()=>{
  const schema=buildProductStructuredData({...common,variants:[
    {id:41,sku:'SHIRT-RED-S',option_name:'Colour',option_value:'Red',option_name_2:'Size',option_value_2:'S',available_stock:2,image_url:'https://shop.example/red-shirt.webp'},
    {id:42,sku:'SHIRT-RED-M',option_name:'Colour',option_value:'Red',option_name_2:'Size',option_value_2:'M',available_stock:0,image_url:''},
    {id:43,sku:'SHIRT-BLUE-S',option_name:'Colour',option_value:'Blue',option_name_2:'Size',option_value_2:'S',available_stock:3,image_url:'https://shop.example/blue-shirt.webp'}
  ]});
  assert.equal(schema['@type'],'ProductGroup');
  assert.deepEqual(schema.variesBy,['https://schema.org/color','https://schema.org/size']);
  assert.equal(schema.hasVariant[0].color,'Red');
  assert.equal(schema.hasVariant[0].size,'S');
  assert.equal(schema.hasVariant[0].image[0],'https://shop.example/red-shirt.webp');
  assert.equal(schema.hasVariant[1].size,'M');
  assert.equal(schema.hasVariant[1].image[0],common.imageUrl,'variant without a specific photo uses the product cover');
  assert.equal(schema.hasVariant[1].offers.availability,'https://schema.org/OutOfStock');
});

test('invalid or missing variant identifiers do not create misleading ProductGroup markup',()=>{
  const schema=buildProductStructuredData({...common,variants:[{id:'invalid',sku:'',option_name:'Size',option_value:'42',available_stock:2}]});
  assert.equal(schema['@type'],'Product');
});


test('localized product structured data uses the same canonical language without malformed query strings',()=>{
 const data=buildProductStructuredData({...common,productUrl:'https://shop.example/product/test-shoe?lang=nl',variants:[
  {id:66,sku:'SHOE-66',option_name:'Size',option_value:'42',available_stock:4}
 ]});
 assert.equal(data.url,'https://shop.example/product/test-shoe?lang=nl');
 assert.equal(data.hasVariant[0].offers.url,'https://shop.example/product/test-shoe?lang=nl&variant=66');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ejs from 'ejs';

test('gallery contains real saved photos only, including Vercel preview',()=>{
  const view=fs.readFileSync(new URL('../views/product.ejs',import.meta.url),'utf8');
  const declarations=view.split('\n')[1];
  assert.ok(declarations.startsWith('<% const actualGallery='));
  const inspect=declarations+'<%- JSON.stringify(productImagesForPage) %>';
  const context={product:{slug:'essential-oversized-t-shirt',name:'Actual shirt',image_url:'/uploads/actual.webp'},images:[],variants:[],selectedVariantId:null,safeImageUrl:value=>value};
  const previous=process.env.VERCEL_ENV;
  try {
    for(const environment of ['preview','production']){
      process.env.VERCEL_ENV=environment;
      assert.deepEqual(JSON.parse(ejs.render(inspect,context)),[{image_url:'/uploads/actual.webp',is_primary:1,alt_text:'Actual shirt'}]);
      const real=[{image_url:'/uploads/own.webp',is_primary:1}];
      assert.deepEqual(JSON.parse(ejs.render(inspect,{...context,images:real})),real);
      assert.deepEqual(JSON.parse(ejs.render(inspect,{...context,product:{...context.product,image_url:''}})),[]);
    }
  }finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
  assert.doesNotMatch(view,/demoGallery|demoPhotoIds|images\.pexels\.com|demo-thumbnail-label/);
});

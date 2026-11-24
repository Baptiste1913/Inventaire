/* clang --target=wasm32 -O3 -msimd128 -nostdlib -Wl,--no-entry
 * -Wl,--export-memory -Wl,--initial-memory=131072 -Wl,--strip-all -o iu-gray.wasm iu-gray.c */
#include <wasm_simd128.h>
__attribute__((export_name("gray"))) void gray(unsigned *p, unsigned n) {
 unsigned i=0;
 v128_t mask=wasm_i32x4_splat(255),a=wasm_i32x4_splat(77),b=wasm_i32x4_splat(150),c=wasm_i32x4_splat(29);
 for(;i+4<=n;i+=4){
  v128_t q=wasm_v128_load(p+i),r=wasm_v128_and(q,mask),g=wasm_v128_and(wasm_u32x4_shr(q,8),mask),bl=wasm_v128_and(wasm_u32x4_shr(q,16),mask);
  v128_t y=wasm_u32x4_shr(wasm_i32x4_add(wasm_i32x4_add(wasm_i32x4_mul(r,a),wasm_i32x4_mul(g,b)),wasm_i32x4_mul(bl,c)),8);
  wasm_v128_store(p+i,wasm_v128_or(wasm_v128_and(q,wasm_i32x4_splat(0xff000000)),wasm_i32x4_mul(y,wasm_i32x4_splat(65793))));
 }
 for(;i<n;i++){unsigned q=p[i],y=(77*(q&255)+150*((q>>8)&255)+29*((q>>16)&255))>>8;p[i]=(q&0xff000000)|y*65793;}
}

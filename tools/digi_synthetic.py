#!/usr/bin/env python3
"""Reproduce v42.50 training, or generate annotated synthetic DIGI-like labels.
Synthetic layout and fonts are approximations, not official DIGI specifications.
No real store records required. Run outside the PWA; no training on iPhone.
Dependencies: numpy, pillow, scikit-learn.
"""
import argparse
import base64
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from sklearn.datasets import load_digits
from sklearn.linear_model import SGDClassifier

FONT_ROOT = Path('/usr/share/fonts/truetype')
TRAIN = ['dejavu/DejaVuSans.ttf','dejavu/DejaVuSansMono.ttf',
         'dejavu/DejaVuSans-Bold.ttf','lato/Lato-Regular.ttf']
TEST = ['noto/NotoSans-Regular.ttf','lato/Lato-Bold.ttf']
L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
R = [''.join('1' if v=='0' else '0' for v in s) for s in L]
PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']

def normalize(im):
    a=np.asarray(im,dtype=np.uint8)
    ys,xs=np.where(a>40)
    if not len(xs): return np.zeros(96,dtype=np.float32)
    im=im.crop((int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)))
    return np.asarray(im.resize((8,12),Image.Resampling.BOX),dtype=np.float32).ravel()/255

def synth(font,digit,rng):
    size=int(rng.integers(18,58))
    f=ImageFont.truetype(str(font),size)
    im=Image.new('L',(90,90))
    ImageDraw.Draw(im).text((12,3),str(digit),font=f,fill=255,stroke_width=int(rng.random()<.12))
    im=im.rotate(float(rng.uniform(-9,9)),resample=Image.Resampling.BICUBIC)
    im=im.filter(ImageFilter.GaussianBlur(float(rng.uniform(0,1.5))))
    if rng.random()<.18: im=im.filter(ImageFilter.MinFilter(3))
    a=np.asarray(im,dtype=np.float32)
    a=np.clip(a+rng.normal(0,6,a.shape),0,255).astype('uint8')
    return normalize(Image.fromarray(a))

def train(root):
    rng=np.random.default_rng(4250)
    training=[root/f for f in TRAIN]; testing=[root/f for f in TEST]
    digits=load_digits()
    X=np.array([normalize(Image.fromarray(np.uint8(im/16*255))) for im in digits.images])
    model=SGDClassifier(loss='log_loss',alpha=.0003,random_state=4250,max_iter=1500,tol=1e-5,average=False)
    model.fit(X,digits.target)
    xx=np.array([synth(f,d,rng) for f in training for d in range(10) for _ in range(100)])
    yy=np.array([d for f in training for d in range(10) for _ in range(100)])
    for _ in range(30):
        i=rng.permutation(len(yy));model.partial_fit(xx[i],yy[i])
    xt=np.array([synth(f,d,rng) for f in testing for d in range(10) for _ in range(60)])
    yt=np.array([d for f in testing for d in range(10) for _ in range(60)])
    coef=np.column_stack((model.coef_,model.intercept_))
    scale=np.max(np.abs(coef))/127
    q=np.rint(coef/scale).astype('int8')
    pred=np.argmax(xt@q[:,:-1].T+q[:,-1],axis=1)
    return dict(scale=float(scale),weights=base64.b64encode(q.tobytes()).decode(),
                train=len(yy),test=len(yt),accuracy=float(np.mean(pred==yt)),
                fonts_train=TRAIN,fonts_test=TEST)

def ean_code(prefix,total):
    raw=(total*65536+5000)//10000
    if not 0<=raw<=99999: raise ValueError('encoded price out of range')
    first=prefix+f'{raw:05d}'
    return first+str((-sum(int(d)*(3 if i%2 else 1) for i,d in enumerate(first)))%10)

def barcode(code):
    p=PARITY[int(code[0])]
    return '101'+''.join((L if p[i]=='L' else G)[int(d)] for i,d in enumerate(code[1:7]))+'01010'+''.join(R[int(d)] for d in code[7:])+'101'

def label(root,font,rng,clean=False):
    items=[('0203476','ARTICLE TEST A'),('0206632','ARTICLE TEST B'),('0205555','ARTICLE TEST C')]
    prefix,name=items[int(rng.integers(len(items)))]
    grams=int(rng.integers(80,8000)); rate=int(rng.integers(79,1800))
    total=(grams*rate+500)//1000
    code=ean_code(prefix,total)
    im=Image.new('L',(720,480),255);d=ImageDraw.Draw(im)
    fontpath=str(root/font)
    def txt(pos,value,size):
        d.text(pos,value,font=ImageFont.truetype(fontpath,size),fill=18)
    money=lambda v:f'{v//100},{v%100:02d}'
    weight=f'{grams//1000},{grams%1000:03d}'
    txt((450,20),'ETIQUETTE TEST',23);txt((58,83),name,45)
    txt((58,179),'EUR/kg',25);txt((270,179),'Poids kg',25);txt((510,179),'Total EUR',25)
    txt((58,214),money(rate),54);txt((270,214),weight,54);txt((505,214),money(total),50)
    bits=barcode(code)
    for i,b in enumerate(bits):
        if b=='1':d.rectangle((38+i*4,320,41+i*4,402),fill=0)
    txt((32,409),code[0]+' '+code[1:7]+' '+code[7:],28)
    # Test split uses different fonts and distinct originals. Each generated
    # image owns its annotation; no transformed copy crosses a split.
    if not clean:
        im=im.rotate(float(rng.uniform(-8,8)),resample=Image.Resampling.BICUBIC,fillcolor=255)
        shear=float(rng.uniform(-.035,.035))
        im=im.transform(im.size,Image.Transform.AFFINE,(1,shear,-shear*240,0,1,0),
                        resample=Image.Resampling.BICUBIC,fillcolor=255)
        im=im.filter(ImageFilter.GaussianBlur(float(rng.uniform(0,1.6))))
        if rng.random()<.15:im=im.filter(ImageFilter.MaxFilter(3))
        a=np.asarray(im,dtype=np.float32)
        # Simulated local glare and thermal contrast variation.
        yy,xx=np.indices(a.shape)
        glare=np.exp(-((xx-rng.uniform(0,720))**2+(yy-rng.uniform(0,480))**2)/(2*rng.uniform(25,95)**2))
        a=a*rng.uniform(.73,1)+rng.uniform(0,48)*glare+rng.normal(0,3,a.shape)
        im=Image.fromarray(np.clip(a,0,255).astype('uint8'))
    return im,dict(name=name,eanPrefix=prefix,ean13=code,weightGrams=grams,pricePerKgCents=rate,
                   totalCents=total,weightText=weight,rateText=money(rate),totalText=money(total),
                   synthetic=True,font=font)

def generate(root,out,count):
    rng=np.random.default_rng(4251)
    out.mkdir(parents=True,exist_ok=True)
    for split,fonts,n in [('train',TRAIN,count),('test',TEST,max(1,count//5))]:
        folder=out/split;folder.mkdir(exist_ok=True)
        with (folder/'annotations.jsonl').open('w',encoding='utf-8') as manifest:
            for i in range(n):
                im,meta=label(root,fonts[i%len(fonts)],rng,clean=i%4==0)
                name=f'label-{i:06d}.png'
                im.save(folder/name)
                manifest.write(json.dumps(dict(file=name,**meta),ensure_ascii=False)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--fonts',type=Path,default=FONT_ROOT)
    p.add_argument('--out',type=Path,default=Path('digi-synthetic'))
    p.add_argument('--count',type=int,default=3000)
    p.add_argument('--train',action='store_true')
    a=p.parse_args()
    if a.train: print(json.dumps(train(a.fonts)))
    else:
        if not 1<=a.count<=50000:p.error('count must be 1..50000')
        generate(a.fonts,a.out,a.count)

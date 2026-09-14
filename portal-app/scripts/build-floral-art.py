"""Original screen-print artwork with gentle CSS wind and reduced-motion support."""
from pathlib import Path
from botanical_vines import botanical_vines
import random, math
r=random.Random(431)
COLORS=['#12834f','#159855','#087548','#238c50']
parts=[]; counter=0

def shape(points):
 return ' '.join(f'{x:.1f},{y:.1f}' for x,y in points)

def texture(path,bounds,amount=140):
 global counter
 counter+=1;key=f'ink{counter}'
 x0,y0,x1,y1=bounds
 out=[f'<clipPath id="{key}">{path}</clipPath><g clip-path="url(#{key})">']
 for i in range(amount):
  x=r.uniform(x0,x1);y=r.uniform(y0,y1);rad=r.uniform(.35,1.9)
  color=r.choice(['#191b19','#191b19','#191b19','#dfaa36','#8d91cf'])
  out.append(f'<path d="M{x:.1f} {y:.1f}l{rad*2:.1f} {-rad:.1f} {rad:.1f} {rad*1.5:.1f} {-rad*2:.1f} {rad:.1f}Z" fill="{color}" opacity="{r.uniform(.3,.9):.2f}"/>')
 for i in range(12):
  x=r.uniform(x0,x1);y=r.uniform(y0,y1)
  out.append(f'<path d="M{x:.1f} {y:.1f}l{r.uniform(-4,6):.1f} {r.uniform(5,19):.1f}" stroke="#191b19" stroke-width="{r.uniform(.4,2):.1f}"/>')
 out.append('</g>');return ''.join(out)

def leaf(x,y,angle,scale=1,variant=0):
 pts=[]
 # Each silhouette has a different lean and ragged contour.
 lean=r.uniform(-20,20)
 for side in [1,-1]:
  ts=range(31) if side==1 else range(30,-1,-1)
  for i in ts:
   t=i/30;w=math.sin(math.pi*t)**.8*(67+variant*8)
   notch=1+.06*math.sin(t*47+variant)+r.uniform(-.04,.04)
   pts.append((side*w*notch+lean*math.sin(t*math.pi)+t*18,-t*245+r.uniform(-2,2)))
 p=f'<polygon points="{shape(pts)}"/>'
 out=[f'<g transform="translate({x} {y}) rotate({angle}) scale({scale})">',f'<g transform="translate(-8 5)" fill="#8e8ac7">{p}</g>',f'<g fill="{r.choice(COLORS)}">{p}</g>']
 out.append('<path d="M-3 4Q23-104 18-235L13-202Q13-70-8 0Z" fill="#e8a927"/>')
 for i in range(5):
  yy=-36-i*34;d=-1 if i%2 else 1;ww=44+8*math.sin(i)
  out.append(f'<path d="M10 {yy}q{d*22} -3 {d*ww} -29l{-d*7} 13q{-d*18} 15 {-d*34} 18Z" fill="{r.choice(["#ef532a","#dfac32","#252d24"])}" opacity=".9"/>')
 out.append(texture(p,(-85,-250,90,5)))
 out.append('</g>');return ''.join(out)

def flower(x,y,scale=1,rotation=0,n=6):
 out=[f'<g transform="translate({x} {y}) rotate({rotation}) scale({scale})">']
 for i in range(n):
  a=360*i/n+r.uniform(-9,9);w=r.uniform(20,35);length=r.uniform(52,88)
  pts=[]
  for j in range(34):
   t=j/34*math.tau
   px=math.cos(t)*w*(1+r.uniform(-.1,.1));py=-length/2+math.sin(t)*length/2
   pts.append((px,py))
  p=f'<polygon points="{shape(pts)}"/>'
  out.append(f'<g transform="rotate({a:.1f})"><g fill="#9293d0" transform="translate(4 -4)">{p}</g><g fill="{r.choice(["#f44b25","#e64423","#f45b25"])}">{p}</g>')
  out.append(f'<path d="M-4-17L2 {-length+12:.1f}l4 19L1-15Z" fill="#f4b634"/>')
  out.append(texture(p,(-w,-length,w,0),42));out.append('</g>')
 pts=[(math.cos(i*math.tau/23)*(23+r.uniform(-3,3)),math.sin(i*math.tau/23)*(21+r.uniform(-3,3))) for i in range(23)]
 p=f'<polygon points="{shape(pts)}"/>';out.append(f'<g fill="#156c43">{p}</g>');out.append(texture(p,(-25,-25,25,25),30));out.append('</g>');return ''.join(out)

def generate(mobile=False):
 global parts,counter
 counter=0
 w,h=(480,960) if mobile else (1440,1000)
 parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" fill="none"><rect width="100%" height="100%" fill="#191b19"/>']
 parts.append('''<style>
 .breeze{transform-box:fill-box;transform-origin:50% 100%}
 @media(prefers-reduced-motion:no-preference){
 .breeze{animation:sway 11s ease-in-out infinite alternate}
 .breeze:nth-of-type(3n){animation-duration:14s;animation-delay:-5s}
 .breeze:nth-of-type(3n + 1){animation-duration:12s;animation-delay:-8s}
 @keyframes sway{0%{transform:rotate(-.6deg) translateX(-1px)}100%{transform:rotate(.8deg) translateX(2px)}}
 }
 </style>''')
 if mobile:
  leaves=[(6,192,-28,.64,1),(76,62,-103,.52,0),(486,233,28,.65,1),(8,1035,-12,.74,2),(483,1030,28,.76,1)]
  flowers=[(362,74,1.04,24,5),(10,270,.56,5,6),(459,776,.84,30,5),(116,926,1.04,-18,7),(470,420,.42,18,6)]
 else:
  leaves=[(80,188,-55,1.22,1),(242,10,-105,1.25,2),(45,372,12,1.18,0),(-50,690,42,1.35,1),(134,1050,-24,1.55,2),(277,1030,-69,1.17,0),(361,1040,18,.88,1),(1390,490,22,1.5,1),(1470,247,-22,1.36,2),(1402,982,42,1.5,0),(1225,1060,-18,1.25,2),(1451,1080,4,1.42,1),(1170,-12,-94,.87,0)]
  flowers=[(72,34,1.02,12,7),(297,218,.7,-23,5),(47,709,.93,8,6),(267,877,1.02,33,5),(1400,60,1.2,17,5),(1347,649,.91,-21,7),(1158,957,.9,11,6),(405,990,.52,30,5)]
  # Open up the lower corners instead of layering dense green foliage.
  leaves=[v for i,v in enumerate(leaves) if i not in (3,6,11)]
 parts.append(botanical_vines(mobile))
 for args in leaves:parts.append('<g class="breeze">'+leaf(*args)+'</g>')
 for args in flowers:parts.append('<g class="breeze">'+flower(*args)+'</g>')
 if mobile:
  accents=[(-12,655,-12,.48,1),(266,1004,-23,.57,0),(367,1015,24,.55,1),
           (-14,462,12,.48,0),(493,644,-14,.57,1),
           (190,1005,-38,.58,1),(414,1002,32,.57,0)]
  for placement in accents:parts.append('<g class="breeze">'+leaf(*placement)+'</g>')
  petals=[(223,89,-32,.65),(408,285,26,.5),(29,747,-18,.55),(300,793,42,.6),(211,909,-45,.45),
          (88,212,24,.42),(416,213,-38,.48),(38,486,18,.4),
          (448,680,-28,.5),(161,808,34,.45),(350,908,-20,.5)]
  parts.append('<g id="scattered-petals">')
  for horizontal,vertical,angle,size in petals:
   parts.append(f'<g transform="translate({horizontal} {vertical}) rotate({angle}) scale({size})"><path d="M0 0Q-10-8-6-23L-1-27Q9-17 4-5Z" fill="#e95029"/><path d="M-2-5L-2-20" stroke="#dfaa36" stroke-width="1.5"/></g>')
  parts.append('</g>')
 parts.append('</svg>')
 name='floral-mobile.svg' if mobile else 'floral-screenprint.svg'
 Path(__file__).resolve().parents[1].joinpath('public',name).write_text(''.join(parts))
 print(name, sum(map(len,parts)))
generate();generate(True)

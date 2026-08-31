function pitchPage(session) {

  const original =
    JSON.stringify(
      session.roster.map(p => ({
        x: p.x,
        y: p.y
      }))
    );

  return `<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"
>

<title>Newcastle Lineup</title>

<style>

*{
box-sizing:border-box;
-webkit-tap-highlight-color:transparent;
}

html,body{
margin:0;
width:100%;
min-height:100%;
font-family:Arial,Helvetica,sans-serif;
background:#07130c;
color:white;
}

body{
overflow:auto;
}

.topbar{
min-height:70px;
display:flex;
align-items:center;
justify-content:space-between;
padding:10px 20px;
background:#08110c;
border-bottom:1px solid rgba(255,255,255,.12);
position:sticky;
top:0;
z-index:100;
}

.title{
font-size:21px;
font-weight:900;
}

.subtitle{
margin-top:3px;
font-size:12px;
color:#8d9a91;
}

.top-buttons{
display:flex;
gap:8px;
}

button{
font-family:inherit;
cursor:pointer;
border:0;
touch-action:manipulation;
}

.top-button{
padding:12px 17px;
border-radius:9px;
color:white;
background:#252d28;
font-weight:800;
}

.finish{
background:#15803d;
}

.finish:disabled{
opacity:.7;
cursor:not-allowed;
}

.main{
display:flex;
align-items:flex-start;
justify-content:center;
gap:18px;
padding:18px;
}

.pitch-area{
width:min(1000px,calc(100vw - 310px));
}

.pitch-wrap{
width:100%;
aspect-ratio:1200 / 900;
}

.pitch{
width:100%;
height:100%;
position:relative;
overflow:hidden;
border-radius:14px;
border:3px solid white;

background:
repeating-linear-gradient(
to bottom,
#247b42 0px,
#247b42 70px,
#1f713c 70px,
#1f713c 140px
);

box-shadow:0 20px 60px rgba(0,0,0,.5);
}

/* GRID */

.pitch.grid-on::after{
content:"";
position:absolute;
inset:0;

background-image:
linear-gradient(
rgba(255,255,255,.10) 1px,
transparent 1px
),
linear-gradient(
90deg,
rgba(255,255,255,.10) 1px,
transparent 1px
);

background-size:5% 5%;

pointer-events:none;
z-index:2;
}

/* PITCH */

.halfway{
position:absolute;
left:0;
right:0;
top:50%;
border-top:3px solid rgba(255,255,255,.85);
z-index:1;
}

.center-circle{
position:absolute;
left:50%;
top:50%;
width:150px;
height:150px;
transform:translate(-50%,-50%);
border:3px solid white;
border-radius:50%;
z-index:1;
}

.center-dot{
position:absolute;
left:50%;
top:50%;
width:8px;
height:8px;
transform:translate(-50%,-50%);
background:white;
border-radius:50%;
z-index:1;
}

.box{
position:absolute;
left:50%;
transform:translateX(-50%);
width:36%;
height:18%;
border-left:3px solid white;
border-right:3px solid white;
z-index:1;
}

.box.top{
top:0;
border-bottom:3px solid white;
}

.box.bottom{
bottom:0;
border-top:3px solid white;
}

.six{
position:absolute;
left:50%;
transform:translateX(-50%);
width:17%;
height:8%;
border-left:3px solid white;
border-right:3px solid white;
z-index:1;
}

.six.top{
top:0;
border-bottom:3px solid white;
}

.six.bottom{
bottom:0;
border-top:3px solid white;
}

/* PLAYERS */

.player{
position:absolute;
width:88px;
min-height:90px;
transform:translate(-50%,-50%);
text-align:center;
z-index:10;
touch-action:none;
user-select:none;
cursor:pointer;
}

.player.dragging{
cursor:grabbing;
z-index:50;
}

.avatar{
width:54px;
height:54px;
margin:auto;
border-radius:50%;
border:3px solid white;
background:#6f7772;
display:flex;
align-items:center;
justify-content:center;
overflow:hidden;
font-size:20px;
font-weight:900;
box-shadow:0 5px 15px rgba(0,0,0,.4);
}

.avatar img{
width:100%;
height:100%;
object-fit:cover;
pointer-events:none;
}

.name{
margin-top:3px;
padding:3px 6px;
background:rgba(0,0,0,.78);
border-radius:5px;
font-size:10px;
font-weight:900;
white-space:nowrap;
max-width:125px;
overflow:hidden;
text-overflow:ellipsis;
}

.position{
margin-top:2px;
font-size:9px;
font-weight:900;
}

.selected{
outline:3px solid #facc15;
outline-offset:3px;
border-radius:50%;
}

/* PANEL */

.panel{
width:255px;
padding:15px;
border-radius:13px;
background:#0d1811;
border:1px solid rgba(255,255,255,.12);
}

.panel h2{
margin:0 0 8px;
font-size:16px;
}

.info{
color:#94a198;
font-size:11px;
line-height:1.5;
margin-bottom:10px;
}

.control{
width:100%;
padding:12px;
margin-bottom:7px;
border-radius:8px;
background:#202a24;
color:white;
font-weight:800;
}

.control.active{
background:#15803d;
}

.control.bench-active{
background:#a16207;
}

.status{
margin-top:10px;
padding:9px;
background:#18231c;
border-radius:7px;
font-size:11px;
line-height:1.5;
}

.members{
margin-top:10px;
display:flex;
flex-direction:column;
gap:6px;
}

.member{
display:flex;
align-items:center;
gap:8px;
padding:8px;
border-radius:7px;
background:#17221b;
cursor:pointer;
touch-action:manipulation;
}

.member:active{
transform:scale(.98);
}

.member img{
width:34px;
height:34px;
border-radius:50%;
flex-shrink:0;
}

.member-name{
font-size:11px;
font-weight:800;
overflow:hidden;
text-overflow:ellipsis;
white-space:nowrap;
}

/* BENCH */

.bench-box{
margin-top:15px;
padding:12px;
border-radius:12px;
background:#0d1811;
border:1px solid rgba(255,255,255,.12);
}

.bench-title{
font-size:15px;
font-weight:900;
margin-bottom:8px;
}

.bench-list{
display:flex;
flex-wrap:wrap;
gap:8px;
}

.bench-player{
display:flex;
align-items:center;
gap:7px;
padding:7px 9px;
background:#17221b;
border-radius:8px;
cursor:pointer;
touch-action:manipulation;
}

.bench-player:active{
transform:scale(.97);
}

.bench-player img{
width:34px;
height:34px;
border-radius:50%;
}

.bench-player-name{
font-size:11px;
font-weight:900;
}

.bench-empty{
font-size:11px;
color:#87948b;
}

/* PHONE */

@media(max-width:850px){

.topbar{
min-height:64px;
padding:9px;
}

.title{
font-size:16px;
}

.subtitle{
display:none;
}

.top-buttons{
gap:5px;
}

.top-button{
padding:11px 12px;
font-size:11px;
}

.main{
display:block;
padding:9px;
}

.pitch-area{
width:100%;
}

.pitch-wrap{
width:100%;
}

.panel{
width:100%;
margin-top:10px;
}

.control{
padding:14px;
font-size:13px;
}

.members{
max-height:300px;
overflow:auto;
}

.player{
width:75px;
}

.avatar{
width:48px;
height:48px;
}

.name{
font-size:9px;
max-width:105px;
}

.position{
font-size:8px;
}

.bench-box{
margin-top:10px;
}

.bench-list{
max-height:220px;
overflow:auto;
}

}

/* VERY SMALL PHONES */

@media(max-width:450px){

.title{
font-size:14px;
}

.top-button{
padding:10px 9px;
font-size:10px;
}

.player{
width:65px;
}

.avatar{
width:44px;
height:44px;
}

.name{
font-size:8px;
max-width:90px;
}

.position{
font-size:7px;
}

.center-circle{
width:100px;
height:100px;
}

}

</style>
</head>

<body>

<div class="topbar">

<div>

<div class="title">
⚽ Newcastle Lineup
</div>

<div class="subtitle">
${session.size}v${session.size} • Build your lineup
</div>

</div>

<div class="top-buttons">

<button
class="top-button"
onclick="resetLineup()"
>
Reset
</button>

<button
class="top-button finish"
onclick="finishLineup()"
>
✓ Done
</button>

</div>

</div>

<div class="main">

<div class="pitch-area">

<div class="pitch-wrap">

<div
class="pitch grid-on"
id="pitch"
>

<div class="halfway"></div>
<div class="center-circle"></div>
<div class="center-dot"></div>

<div class="box top"></div>
<div class="box bottom"></div>

<div class="six top"></div>
<div class="six bottom"></div>

<div id="players"></div>

</div>

</div>

<!-- BENCH -->

<div class="bench-box">

<div class="bench-title">
🪑 BENCH
</div>

<div
class="bench-list"
id="benchList"
>
<div class="bench-empty">
No players on the bench.
</div>
</div>

</div>

</div>

<!-- CONTROLS -->

<div class="panel">

<h2>
Lineup Controls
</h2>

<div class="info">

Click a grey circle to select a player slot.

Choose a Discord player below.

Use Change Position to change their position.

Use Move Player to freely move players.

Players snap to the grid.

Click Bench Player, then click a player to put them on the bench.

Click a bench player to remove them from the bench.

</div>

<button
class="control"
id="positionButton"
onclick="changePosition()"
>
⚽ Change Position
</button>

<button
class="control"
id="moveButton"
onclick="toggleMove()"
>
↔ Move Player
</button>

<button
class="control"
id="benchButton"
onclick="toggleBenchMode()"
>
🪑 Bench Player
</button>

<div
class="status"
id="status"
>
No player selected.
</div>

<div
class="members"
id="members"
></div>

</div>

</div>

<script>

"use strict";

const SESSION =
"${escapeHtml(session.id)}";

const CREATOR =
"${escapeHtml(session.creatorId)}";

const ORIGINAL =
${original};

let state = null;

let selected = null;

let moving = false;

let benchMode = false;

let dragging = null;

const pitch =
document.getElementById("pitch");

const players =
document.getElementById("players");

const members =
document.getElementById("members");

const benchList =
document.getElementById("benchList");

const statusBox =
document.getElementById("status");


/* =========================
   LOAD
========================= */

async function load(){

try{

const response =
await fetch(
"/api/session/" +
encodeURIComponent(SESSION)
);

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not load lineup."
);

}

state = data;

render();

}catch(error){

console.error(error);

document.body.innerHTML =
"<div style='padding:30px;color:white;font-family:Arial'>" +
"<h2>❌ Lineup could not be loaded</h2>" +
"<p>" +
escapeHTML(error.message) +
"</p></div>";

}

}


/* =========================
   RENDER
========================= */

function render(){

renderPlayers();

renderMembers();

renderBench();

updateStatus();

}


/* =========================
   PLAYERS
========================= */

function renderPlayers(){

players.innerHTML = "";

state.roster.forEach(
(player,index)=>{

/*
Do not show players that
are currently on the bench.
*/

if(player.bench) return;

const el =
document.createElement("div");

el.className =
"player" +
(selected === index
? " selected"
: "");

el.style.left =
player.x + "%";

el.style.top =
player.y + "%";

let avatar;

if(player.avatar){

avatar =
"<div class='avatar'>" +
"<img src='" +
escapeHTML(player.avatar) +
"' draggable='false'>" +
"</div>";

}else{

avatar =
"<div class='avatar'>?</div>";

}

el.innerHTML =
avatar +

"<div class='name'>" +
escapeHTML(
player.name ||
"Select Player"
) +
"</div>" +

"<div class='position'>" +
escapeHTML(player.position) +
"</div>";


/* =========================
   CLICK PLAYER
========================= */

el.addEventListener(
"click",
event=>{

event.stopPropagation();


/*
BENCH MODE:
Click Bench first,
then click any player.
*/

if(benchMode){

sendToBench(index);

return;

}


/*
NORMAL MODE:
Select player.
*/

selected = index;

renderPlayers();

updateStatus();

showMembers();

});


/* =========================
   DOUBLE CLICK STOP
========================= */

el.addEventListener(
"dblclick",
event=>{

event.stopPropagation();

moving = false;

updateMoveButton();

});


/* =========================
   POINTER DOWN
========================= */

el.addEventListener(
"pointerdown",
event=>{

if(!moving) return;

event.preventDefault();

selected = index;

dragging = {

element:el,

index:index,

pointerId:event.pointerId

};

el.classList.add("dragging");

try{

el.setPointerCapture(
event.pointerId
);

}catch{}

});


/* =========================
   POINTER MOVE
========================= */

el.addEventListener(
"pointermove",
event=>{

if(
!dragging ||
dragging.element !== el
){

return;

}

event.preventDefault();

const rect =
pitch.getBoundingClientRect();

let x =
((event.clientX - rect.left) /
rect.width) * 100;

let y =
((event.clientY - rect.top) /
rect.height) * 100;


/*
GRID SNAP
*/

x =
Math.round(x / 5) * 5;

y =
Math.round(y / 5) * 5;

x =
Math.max(
4,
Math.min(96,x)
);

y =
Math.max(
5,
Math.min(95,y)
);

el.style.left =
x + "%";

el.style.top =
y + "%";

state.roster[index].x =
x;

state.roster[index].y =
y;

});


/* =========================
   POINTER UP
========================= */

el.addEventListener(
"pointerup",
async event=>{

if(!dragging) return;

try{

el.releasePointerCapture(
event.pointerId
);

}catch{}

el.classList.remove(
"dragging"
);

const index =
dragging.index;

dragging = null;

await saveMove(index);

});


players.appendChild(el);

});

}


/* =========================
   DISCORD MEMBERS
========================= */

function renderMembers(){

members.innerHTML = "";

if(!state.serverMembers) return;

state.serverMembers.forEach(
member=>{

const el =
document.createElement("div");

el.className =
"member";

el.innerHTML =
"<img src='" +
escapeHTML(member.avatar) +
"' draggable='false'>" +

"<div class='member-name'>" +
escapeHTML(member.name) +
"</div>";

el.onclick =
()=>assignPlayer(member);

members.appendChild(el);

});

}


/* =========================
   BENCH
========================= */

function renderBench(){

benchList.innerHTML = "";

const bench =
state.roster.filter(
p => p.bench && p.userId
);

if(!bench.length){

benchList.innerHTML =
"<div class='bench-empty'>" +
"No players on the bench." +
"</div>";

return;

}

bench.forEach(
player=>{

const el =
document.createElement("div");

el.className =
"bench-player";

el.innerHTML =
"<img src='" +
escapeHTML(player.avatar) +
"' draggable='false'>" +

"<div>" +

"<div class='bench-player-name'>" +
escapeHTML(player.name) +
"</div>" +

"<div style='font-size:9px;color:#9ca89f'>" +
escapeHTML(player.position) +
"</div>" +

"<div style='font-size:8px;color:#dcae45'>" +
"Click to remove from bench" +
"</div>" +

"</div>";

/*
Clicking a bench player
removes them from the bench.
*/

el.onclick =
()=>removeFromBench(player.slot);

benchList.appendChild(el);

});

}


/* =========================
   MEMBERS SCROLL
========================= */

function showMembers(){

members.scrollIntoView({
behavior:"smooth",
block:"nearest"
});

}


/* =========================
   STATUS
========================= */

function updateStatus(){

if(selected === null){

statusBox.textContent =
"No player selected.";

return;

}

const player =
state.roster[selected];

statusBox.innerHTML =
"<b>Selected:</b> " +
escapeHTML(
player.name ||
"Empty slot"
) +

"<br>" +

"<b>Position:</b> " +
escapeHTML(player.position) +

(player.bench

? "<br><b>Status:</b> On Bench"

: "");

}


/* =========================
   ASSIGN PLAYER
========================= */

async function assignPlayer(member){

if(selected === null){

alert(
"Click a grey player circle first."
);

return;

}

try{

const response =
await fetch(
"/api/assign",
{
method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

session:SESSION,

uid:CREATOR,

slot:selected,

userId:member.id

})

});

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not assign player."
);

}

state.roster[selected] =
data.slot;

render();

}catch(error){

alert(error.message);

}

}


/* =========================
   POSITION
========================= */

async function changePosition(){

if(selected === null){

alert(
"Select a player first."
);

return;

}

const player =
state.roster[selected];

const position =
prompt(
"Type the position:",
player.position
);

if(position === null) return;

const clean =
position.trim();

if(!clean) return;

try{

const response =
await fetch(
"/api/position",
{
method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

session:SESSION,

uid:CREATOR,

slot:selected,

position:clean

})

});

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not change position."
);

}

state.roster[selected] =
data.slot;

render();

}catch(error){

alert(error.message);

}

}


/* =========================
   MOVE
========================= */

function toggleMove(){

if(selected === null){

alert(
"Select a player first."
);

return;

}

moving = !moving;


/*
Moving turns Bench Mode off.
*/

if(moving){

benchMode = false;

updateBenchButton();

}


/*
GRID ALWAYS STAYS ON.
*/

pitch.classList.add(
"grid-on"
);

updateMoveButton();

}


function updateMoveButton(){

const button =
document.getElementById(
"moveButton"
);

if(moving){

button.classList.add(
"active"
);

button.textContent =
"✓ Moving — Grid Snap ON";

}else{

button.classList.remove(
"active"
);

button.textContent =
"↔ Move Player";

}

}


/* =========================
   BENCH MODE
========================= */

function toggleBenchMode(){

/*
IMPORTANT:
You do NOT need to select
a player first anymore.

Click Bench → click player.
*/

benchMode = !benchMode;


/*
Bench mode turns Move Mode off.
*/

if(benchMode){

moving = false;

updateMoveButton();

}

updateBenchButton();

}


function updateBenchButton(){

const button =
document.getElementById(
"benchButton"
);

if(benchMode){

button.classList.add(
"bench-active"
);

button.textContent =
"✓ Bench Mode — Click Player";

}else{

button.classList.remove(
"bench-active"
);

button.textContent =
"🪑 Bench Player";

}

}


/* =========================
   SEND PLAYER TO BENCH
========================= */

async function sendToBench(index){

try{

const response =
await fetch(
"/api/bench",
{
method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

session:SESSION,

uid:CREATOR,

slot:index,

bench:true

})

});

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not move player to bench."
);

}

state.roster[index] =
data.slot;

/*
Turn bench mode off
after selecting a player.
*/

benchMode = false;

selected = null;

updateBenchButton();

render();

}catch(error){

alert(error.message);

}

}


/* =========================
   REMOVE FROM BENCH
========================= */

async function removeFromBench(index){

try{

const response =
await fetch(
"/api/bench",
{
method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

session:SESSION,

uid:CREATOR,

slot:index,

bench:false

})

});

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not remove player from bench."
);

}

state.roster[index] =
data.slot;

selected = index;

render();

}catch(error){

alert(error.message);

}

}


/* =========================
   SAVE MOVE
========================= */

async function saveMove(index){

const player =
state.roster[index];

try{

const response =
await fetch(
"/api/move",
{
method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

session:SESSION,

uid:CREATOR,

slot:index,

x:player.x,

y:player.y

})

});

if(!response.ok){

console.error(
"Move was not saved."
);

}

}catch(error){

console.error(
"Move save error:",
error
);

}

}


/* =========================
   RESET
========================= */

async function resetLineup(){

if(
!confirm(
"Reset all players?"
)
){

return;

}

state.roster.forEach(
(player,index)=>{

player.userId = null;

player.name = "";

player.avatar = "";

player.bench = false;

player.x =
ORIGINAL[index].x;

player.y =
ORIGINAL[index].y;

});

selected = null;

moving = false;

benchMode = false;

updateMoveButton();

updateBenchButton();

render();

await saveAll();

}


/* =========================
   SAVE ALL
========================= */

async function saveAll(){

try{

const response =
await fetch(
"/api/session/" +
encodeURIComponent(SESSION),
{
method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

uid:CREATOR,

roster:state.roster

})

});

if(!response.ok){

console.error(
"Could not save lineup."
);

}

}catch(error){

console.error(error);

}

}


/* =========================
   FINISH
========================= */

async function finishLineup(){

if(
!confirm(
"Finish this lineup and post it to the Discord channel?"
)
){

return;

}

await saveAll();

const button =
document.querySelector(".finish");

button.disabled = true;

button.textContent =
"Posting...";

try{

const response =
await fetch(
"/api/finish/" +
encodeURIComponent(SESSION),
{
method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

uid:CREATOR

})

});

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Could not finish lineup."
);

}

button.textContent =
"✓ Posted!";

}catch(error){

button.disabled = false;

button.textContent =
"✓ Done";

alert(error.message);

}

}


/* =========================
   START
========================= */

load();

</script>

</body>
</html>`;
}

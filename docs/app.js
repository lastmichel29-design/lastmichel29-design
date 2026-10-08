const chat=document.getElementById("chat");
const form=document.getElementById("agentForm");
const input=document.getElementById("question");

const entries=[
  {keys:["what is axyom","axyom","que es axyom"],answer:"AXYOM is an independent R&D project focused on AI-agent evaluation, automation, local/offline AI, computer-use systems, and reproducible verification."},
  {keys:["evidence","proof","what evidence exists","pruebas"],answer:"Public evidence includes the 18-repository research lab, R4→R5 adjudication, Context Governor R1, and documented Windows computer-use experiments. Public evidence is intentionally separated from private implementation."},
  {keys:["context governor","tokens","token"],answer:"Context Governor R1 is a local context-budget system designed to reduce unnecessary model context. Public self-tests include MICRO at an estimated 1,962 of 2,000 tokens and NORMAL at 2,586 of 12,000. These are local estimates, not provider billing values."},
  {keys:["r4 r5","r4","r5","classification"],answer:"R4 was preserved as historical evidence. R5 was created as a separate adjudication layer after weaknesses were found. Public results record 8 material role corrections, 8 taxonomy refinements, and 2 confirmations."},
  {keys:["services","freelance","work","hire"],answer:"Michel is available for AI-agent evaluation, Python and PowerShell automation, Windows automation, computer-use testing, local AI prototypes, repository auditing, and verification tooling."},
  {keys:["windows","uia","automation"],answer:"AXYOM experiments include structured Windows UI Automation, accessibility-tree interaction, constrained actions, and post-action verification."}
];

function norm(v){return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim()}
function answer(q){
  const n=norm(q);
  let best=null,score=0;
  for(const e of entries){
    let s=0;
    for(const k of e.keys) if(n.includes(norm(k))) s+=k.length;
    if(s>score){score=s;best=e}
  }
  return best?best.answer:"That information is not present in the public AXYOM corpus. This demo will not invent an answer.";
}
function add(text,type){
  const el=document.createElement("div");
  el.className="msg "+type;
  el.textContent=text;
  chat.appendChild(el);
  chat.scrollTop=chat.scrollHeight;
}
function ask(q){
  q=q.trim();
  if(!q)return;
  add(q,"user");
  add(answer(q),"agent");
  input.focus();
}
form.addEventListener("submit",e=>{e.preventDefault();const q=input.value;input.value="";ask(q)});
document.querySelectorAll("[data-q]").forEach(b=>b.addEventListener("click",()=>ask(b.dataset.q)));

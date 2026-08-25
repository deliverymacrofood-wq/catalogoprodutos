const client=supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
const sectors=["Todos","Chocolates","Confeitaria","Sorveteria","Restaurante","Ocidental","Resfriados","Congelados"];let active="Todos";let products=[];
const money=v=>Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function renderCats(){document.getElementById("cats").innerHTML=sectors.map(s=>`<button class="cat ${s===active?"active":""}" onclick="active='${s}';render()">${s}</button>`).join("")}
async function load(){
  try {
    let {data,error}=await client.from("products").select("*").eq("active",true).order("name");
    if(error){
      console.error("Erro ao carregar produtos do Supabase:",error);
      document.getElementById("grid").innerHTML="<div class='notice'>Não foi possível carregar os produtos. Verifique a configuração do Supabase e as políticas RLS.</div>";
      return;
    }
    products=data||[];
    render();
  } catch(error) {
    console.error("Erro de conexão com o Supabase:",error);
    document.getElementById("grid").innerHTML="<div class='notice'>Não foi possível conectar ao Supabase.</div>";
  }
}
function render(){renderCats();let q=document.getElementById("search").value.toLowerCase().trim();let list=products.filter(p=>(active==="Todos"||p.sector===active)&&(!q||p.name.toLowerCase().includes(q)||p.sector.toLowerCase().includes(q)));document.getElementById("grid").innerHTML=list.length?list.map(p=>`<article class="card"><div class="pic">${p.image_url?`<img src="${p.image_url}" alt="${esc(p.name)}">`:"📦"}</div><div class="info"><div class="sector">${esc(p.sector)}</div><div class="name">${esc(p.name)}</div>${p.product_code?`<div class="code">Código: ${esc(p.product_code)}</div>`:""}<div class="price">${money(p.price)}</div></div></article>`).join(""):"<div style='grid-column:1/-1;text-align:center;padding:40px;color:#777'>Nenhum produto encontrado.</div>"}
load();
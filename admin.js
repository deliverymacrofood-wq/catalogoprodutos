const client = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
let editing = null;
let products = [];

const sectors = ["Chocolates", "Confeitaria", "Sorveteria", "Restaurante", "Ocidental", "Resfriados", "Congelados"];
const money = v => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

const $ = id => document.getElementById(id);

async function init() {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return login();

  const { data: profile, error } = await client
    .from("profiles")
    .select("role,email")
    .eq("id", session.user.id)
    .single();

  if (error || !profile || profile.role !== "admin") {
    $("app").innerHTML = "<div class='panel'><h2>Acesso negado</h2><p>Seu usuário não possui permissão de administrador.</p><button class='primary' id='logoutBtn'>Sair</button></div>";
    $("logoutBtn").addEventListener("click", logout);
    return;
  }

  panel();
}

function login() {
  $("app").innerHTML = `
    <div class="panel login">
      <h2>Login do administrador</h2>
      <p>Entre para gerenciar o catálogo.</p>
      <input id="email" type="email" placeholder="E-mail" autocomplete="username">
      <input id="pass" type="password" placeholder="Senha" autocomplete="current-password">
      <button class="primary" id="loginBtn">Entrar</button>
      <p id="msg" style="color:#a00000"></p>
    </div>`;

  $("loginBtn").addEventListener("click", doLogin);
}

async function doLogin() {
  const email = $("email").value.trim();
  const password = $("pass").value;
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    $("msg").textContent = error.message;
    return;
  }
  location.reload();
}

async function logout() {
  await client.auth.signOut();
  location.reload();
}

async function panel() {
  $("app").innerHTML = `
    <div class="panel">
      <button class="primary" style="float:right" id="logoutBtn">Sair</button>
      <h2>Gerenciar produtos</h2>
      <form class="form" id="productForm">
        <label>Nome
          <input id="name" required maxlength="150" autocomplete="off">
        </label>

        <label>Código (até 6 dígitos)
          <input id="productCode" type="text" inputmode="numeric" maxlength="6" pattern="[0-9]{1,6}" placeholder="Ex.: 001234" autocomplete="off">
        </label>

        <label>Preço
          <input id="price" type="number" step="0.01" min="0" required>
        </label>

        <label>Setor
          <select id="sector">${sectors.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select>
        </label>

        <label>Imagem
          <input id="image" type="file" accept="image/*">
        </label>

        <label style="display:flex;align-items:center;gap:8px;margin-top:25px">
          <input id="active" type="checkbox" checked style="width:auto;margin:0">
          Produto ativo no catálogo
        </label>

        <div class="full">
          <button class="primary" type="submit" id="save">Adicionar produto</button>
          <button type="button" class="secondary" id="clearBtn">Limpar</button>
        </div>
      </form>
      <div id="list" style="margin-top:25px"></div>
    </div>`;

  $("logoutBtn").addEventListener("click", logout);
  $("productForm").addEventListener("submit", saveProduct);
  $("clearBtn").addEventListener("click", clearForm);
  $("productCode").addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  });

  await load();
}

async function load() {
  const { data, error } = await client
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    $("list").innerHTML = `<div class='notice'>${esc(error.message)}</div>`;
    return;
  }

  products = data || [];
  $("list").innerHTML = products.map(p => `
    <div class="row">
      <img class="thumb" src="${esc(p.image_url || "")}" alt="${esc(p.name)}">
      <div class="grow">
        <b>${esc(p.name)}</b><br>
        <small>
          ${p.product_code ? `Código: ${esc(p.product_code)} • ` : ""}
          ${esc(p.sector)} • ${money(p.price)} • ${p.active ? "Ativo" : "Oculto"}
        </small>
      </div>
      <button class="secondary editBtn" data-id="${esc(p.id)}" type="button">✏️</button>
      <button class="danger deleteBtn" data-id="${esc(p.id)}" type="button">🗑️</button>
    </div>`).join("");

  document.querySelectorAll(".editBtn").forEach(btn => {
    btn.addEventListener("click", () => edit(btn.dataset.id));
  });
  document.querySelectorAll(".deleteBtn").forEach(btn => {
    btn.addEventListener("click", () => removeProduct(btn.dataset.id));
  });
}

async function upload(file) {
  if (!file) return null;
  const ext = file.name.split(".").pop().toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage
    .from("product-images")
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) throw error;
  return client.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

async function saveProduct(e) {
  e.preventDefault();

  const name = $("name").value.trim();
  const productCode = $("productCode").value.trim();
  const price = Number($("price").value);
  const sector = $("sector").value;
  const imageFile = $("image").files[0];
  const active = $("active").checked;
  const wasEditing = Boolean(editing);

  if (!name) return alert("Informe o nome do produto.");
  if (productCode && !/^\d{1,6}$/.test(productCode)) {
    return alert("O código deve conter somente números e ter no máximo 6 dígitos.");
  }
  if (!Number.isFinite(price) || price < 0) return alert("Informe um preço válido.");

  try {
    let imageUrl = editing?.image_url || null;
    if (imageFile) imageUrl = await upload(imageFile);

    const payload = {
      name,
      product_code: productCode || null,
      price,
      sector,
      active,
      image_url: imageUrl,
      updated_at: new Date().toISOString()
    };

    const res = wasEditing
      ? await client.from("products").update(payload).eq("id", editing.id)
      : await client.from("products").insert(payload);

    if (res.error) throw res.error;

    clearForm();
    await load();
    alert(wasEditing ? "Produto atualizado!" : "Produto cadastrado!");
  } catch (err) {
    alert("Erro: " + (err?.message || String(err)));
    console.error(err);
  }
}

function edit(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  editing = product;
  $("name").value = product.name || "";
  $("productCode").value = product.product_code || "";
  $("price").value = product.price ?? "";
  $("sector").value = product.sector || sectors[0];
  $("active").checked = Boolean(product.active);
  $("image").value = "";
  $("save").textContent = "Salvar alterações";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearForm() {
  editing = null;
  $("productForm").reset();
  $("active").checked = true;
  $("save").textContent = "Adicionar produto";
}

async function removeProduct(id) {
  if (!confirm("Excluir este produto?")) return;
  const { error } = await client.from("products").delete().eq("id", id);
  if (error) alert(error.message);
  else await load();
}

init();

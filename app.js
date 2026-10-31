(function(){
"use strict";
var P=[],CATS=["All"],cfg={whatsapp:"",upi:"",upiPhone:"",name:"Super Mart"};
var state={cat:"All",q:"",sort:"rel",cart:{},user:null,after:null};
var $=function(i){return document.getElementById(i)};
var inr=function(n){return "₹"+Number(n).toLocaleString("en-IN")};
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function btn(txt,cls,fn){var b=el("button",cls,txt);b.type="button";if(fn)b.onclick=fn;return b}
function toast(m){var t=$("toast");t.textContent=m;t.classList.add("on");clearTimeout(toast.h);toast.h=setTimeout(function(){t.classList.remove("on")},2200)}
function api(url,body){var o={credentials:"same-origin",headers:{}};if(body){o.method="POST";o.headers["Content-Type"]="application/json";o.body=JSON.stringify(body)}
  return fetch(url,o).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok){var e=new Error(j.error||"Something went wrong. Try again.");e.status=r.status;throw e}return j})})}
function mk(x){var p=el("div","pic");p.style.background=x.b;p.setAttribute("aria-hidden","true");
  if(x.img){var i=document.createElement("img");i.src=x.img;i.alt="";i.loading="lazy";p.appendChild(i)}else p.textContent=x.e;return p}
function find(id){return P.filter(function(p){return p.id===id})[0]}
function load(){try{var d=JSON.parse(localStorage.getItem("sm_cart")||"{}");Object.keys(d).forEach(function(k){var q=Math.floor(+d[k]);if(find(+k)&&q>0&&q<=10)state.cart[k]=q})}catch(e){state.cart={}}}
function save(){try{localStorage.setItem("sm_cart",JSON.stringify(state.cart))}catch(e){}}
function fee(t){return t===0||t>=499?0:49}
function total(){return Object.keys(state.cart).reduce(function(s,k){var x=find(+k);return s+(x?x.p*state.cart[k]:0)},0)}
function openD(d){if(!d.open)d.showModal()}
function when(ms){return new Date(ms).toLocaleString("en-IN",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"})}

/* ---------- shop ---------- */
function loadProducts(){return api("/api/products").then(function(r){P=r.products;CATS=["All"].concat(P.map(function(x){return x.c}).filter(function(v,i,a){return a.indexOf(v)===i}));if(CATS.indexOf(state.cat)<0)state.cat="All"})}
function renderCats(){var n=$("cats");n.textContent="";CATS.forEach(function(c){var b=btn(c,"chip",function(){state.cat=c;renderCats();renderGrid()});b.setAttribute("aria-pressed",String(c===state.cat));n.appendChild(b)})}
function badge(x){return x.rc?el("span","rate","★ "+x.r.toFixed(1)+" ("+x.rc+")"):el("span","rate none","New")}
function renderGrid(){
  var q=state.q.trim().toLowerCase();
  var L=P.filter(function(x){return(state.cat==="All"||x.c===state.cat)&&(!q||x.n.toLowerCase().indexOf(q)>-1||x.c.toLowerCase().indexOf(q)>-1)});
  if(state.sort==="lo")L.sort(function(a,b){return a.p-b.p});
  if(state.sort==="hi")L.sort(function(a,b){return b.p-a.p});
  if(state.sort==="rt")L.sort(function(a,b){return b.r-a.r});
  $("meta").textContent=L.length+" product"+(L.length===1?"":"s");
  var g=$("grid");g.textContent="";
  if(!L.length){g.appendChild(el("div","empty","No products match your search. Try a different word or pick another category."));return}
  L.forEach(function(x){
    var c=el("article","card"),pr=el("div","price",inr(x.p));
    if(x.m>x.p){pr.appendChild(el("s",null,inr(x.m)));pr.appendChild(el("em",null,Math.round((x.m-x.p)/x.m*100)+"% off"))}
    c.append(mk(x),el("h3",null,x.n),badge(x),pr,btn("Add to cart","btn",function(){setQty(x.id,(state.cart[x.id]||0)+1);toast(x.n+" added to cart")}));
    g.appendChild(c)})}
function setQty(id,q){if(q<=0)delete state.cart[id];else state.cart[id]=Math.min(10,q);save();renderCart()}
function renderCart(){
  var n=0;Object.keys(state.cart).forEach(function(k){n+=state.cart[k]});$("cnt").textContent=n;
  var b=$("cartB");b.textContent="";
  if(!n){b.appendChild(el("div","empty","Your cart is empty. Add something you like."));$("toCheckout").disabled=true;$("tot").textContent=inr(0);return}
  $("toCheckout").disabled=false;
  P.forEach(function(x){var q=state.cart[x.id];if(!q)return;
    var r=el("div","row"),t=el("div","t");t.append(el("div",null,x.n),el("b",null,inr(x.p*q)));
    var m=btn("−",null,function(){setQty(x.id,q-1)}),pl=btn("+",null,function(){setQty(x.id,q+1)});
    m.setAttribute("aria-label","Decrease quantity");pl.setAttribute("aria-label","Increase quantity");
    var qt=el("div","qty");qt.append(m,el("span",null,String(q)),pl);r.append(mk(x),t,qt);b.appendChild(r)});
  var s=total(),f=fee(s),d=el("div","pad");
  [["Items",inr(s)],["Delivery",f?inr(f):"Free"]].forEach(function(a){var w=el("div","sum");w.append(el("span",null,a[0]),el("span",null,a[1]));d.appendChild(w)});
  b.appendChild(d);$("tot").textContent=inr(s+f)}

/* ---------- dialogs ---------- */
document.querySelectorAll("[data-close]").forEach(function(b){b.onclick=function(){b.closest("dialog").close()}});
["cartD","coD","okD","auD","ordD","admD"].forEach(function(i){$(i).addEventListener("click",function(e){if(e.target===this)this.close()})});
$("cartOpen").onclick=function(){renderCart();openD($("cartD"))};
$("home").onclick=function(){state.cat="All";state.q="";$("q").value="";renderCats();renderGrid();window.scrollTo(0,0)};
$("sf").onsubmit=function(e){e.preventDefault();state.q=$("q").value.slice(0,60);renderGrid()};
$("sort").onchange=function(){state.sort=this.value;renderGrid()};
function setUser(u){state.user=u;$("acct").textContent=u?u.name.split(" ")[0].slice(0,12):"Login";$("adm").hidden=!(u&&u.admin)}

/* ---------- login / register ---------- */
var mode="login";
function setMode(m){mode=m;var reg=m==="register";$("aut").textContent=reg?"Create account":"Log in";$("auB").textContent=reg?"Create account":"Log in";
  $("nmW").hidden=!reg;$("ap").autocomplete=reg?"new-password":"current-password";$("e-au").textContent="";
  $("auN").textContent=reg?"Already registered? ":"New here? ";$("auN").appendChild(btn(reg?"Log in":"Create an account","link",function(){setMode(reg?"login":"register")}))}
function openAuth(){setMode("login");openD($("auD"))}
$("auF").onsubmit=function(e){e.preventDefault();var em=$("ae").value.trim(),pw=$("ap").value,nm=$("an").value.trim(),er=$("e-au");
  if(mode==="register"&&nm.length<2){er.textContent="Enter your name.";return}
  if(!/^\S+@\S+$/.test(em)){er.textContent="Enter a valid email address.";return}
  if(pw.length<8){er.textContent="Password must be at least 8 characters.";return}
  $("auB").disabled=true;er.textContent="";
  api(mode==="register"?"/api/register":"/api/login",mode==="register"?{name:nm,email:em,password:pw}:{email:em,password:pw}).then(function(r){
    setUser(r.user);$("auF").reset();$("auD").close();toast("Welcome, "+r.user.name.split(" ")[0]);
    if(state.after==="checkout"){state.after=null;startCheckout()}
  }).catch(function(x){er.textContent=x.message}).then(function(){$("auB").disabled=false})};
$("out").onclick=function(){api("/api/logout",{}).catch(function(){}).then(function(){setUser(null);$("ordD").close();$("admD").close();toast("Logged out")})};

/* ---------- checkout ---------- */
function startCheckout(){var s=total();$("coT").textContent="Total "+inr(s+fee(s));openD($("coD"))}
$("toCheckout").onclick=function(){$("cartD").close();if(!state.user){state.after="checkout";openAuth();return}startCheckout()};
function chk(id,ok,m){$("e-"+id).textContent=ok?"":m;return ok}
$("coF").onsubmit=function(e){e.preventDefault();
  var nm=$("nm").value.trim(),ph=$("ph").value.trim(),pn=$("pn").value.trim(),ad=$("ad").value.trim(),pay=$("py").value;
  var ok=[chk("nm",nm.length>=2,"Enter your full name."),chk("ph",/^[6-9]\d{9}$/.test(ph),"Enter a valid 10-digit mobile number."),chk("pn",/^[1-9]\d{5}$/.test(pn),"Enter a valid 6-digit PIN code."),chk("ad",ad.length>=10,"Enter your full address (at least 10 characters).")].every(Boolean);
  if(!ok)return;
  var sb=$("coF").querySelector("button[type=submit]");sb.disabled=true;
  var items=Object.keys(state.cart).map(function(k){return{id:+k,qty:state.cart[k]}});
  api("/api/orders",{items:items,name:nm,phone:ph,pin:pn,address:ad,payment:pay}).then(function(r){
    var lines=items.map(function(i){var x=find(i.id);return "• "+x.n+" × "+i.qty+" = "+inr(x.p*i.qty)+(x.img?"\n  Photo: "+location.origin+x.img:"")}).join("\n");
    var msg="New order "+r.id+"\n"+lines+"\nTotal: "+inr(r.total)+"\nPayment: "+(pay==="UPI"?"UPI (screenshot will be sent)":pay)+"\nName: "+nm+"\nPhone: "+ph+"\nAddress: "+ad+", "+pn;
    state.cart={};save();renderCart();$("coF").reset();$("coD").close();showDone(r,nm,pay,msg)
  }).catch(function(x){if(x.status===401){setUser(null);$("coD").close();state.after="checkout";openAuth()}else toast(x.message)}).then(function(){sb.disabled=false})};
function showDone(r,nm,pay,msg){
  $("okN").textContent=nm;$("okId").textContent=r.id;var a=$("okA");a.textContent="";
  function link(txt,href,cls){var l=el("a","btn "+cls,txt);l.href=href;l.rel="noopener";l.target="_blank";a.appendChild(l)}
  if(pay==="UPI"){
    if(cfg.upi){link("Pay "+inr(r.total)+" with UPI","upi://pay?pa="+encodeURIComponent(cfg.upi)+"&pn="+encodeURIComponent(cfg.name)+"&am="+r.total+"&cu=INR&tn="+encodeURIComponent(r.id),"");
      a.appendChild(el("p","note","After paying, send the payment screenshot on WhatsApp. Your order is confirmed once the seller sees the payment."))}
    else if(cfg.upiPhone)a.appendChild(el("p","note","Pay "+inr(r.total)+" to UPI number "+cfg.upiPhone+" using GPay, PhonePe or Paytm, then send the payment screenshot on WhatsApp. Your order is confirmed once the seller sees the payment."))}
  if(cfg.whatsapp)link("Send order on WhatsApp","https://wa.me/"+cfg.whatsapp+"?text="+encodeURIComponent(msg),"wa");
  else a.appendChild(el("p","err","The seller has not set a WhatsApp number yet. Your order is saved under My orders."));
  a.appendChild(btn("Copy order details","btn alt",function(){try{navigator.clipboard.writeText(msg).then(function(){toast("Copied")},function(){toast("Could not copy")})}catch(x){toast("Could not copy")}}));
  openD($("okD"))}

/* ---------- my orders + ratings ---------- */
function starRow(i){var w=el("div","stars");w.setAttribute("role","group");w.setAttribute("aria-label","Rate "+i.name);
  function draw(){w.textContent="";for(var n=1;n<=5;n++)(function(n){var b=btn("★",n<=i.mine?"on":"",function(){
    api("/api/ratings",{product_id:i.id,stars:n}).then(function(){i.mine=n;draw();toast("Thanks for rating");loadProducts().then(renderGrid)}).catch(function(x){toast(x.message)})});
    b.setAttribute("aria-label","Rate "+n+" star"+(n>1?"s":""));w.appendChild(b)})(n)}
  draw();return w}
$("acct").onclick=function(){
  if(!state.user){state.after=null;openAuth();return}
  $("ordU").textContent=state.user.email;var b=$("ordB");b.textContent="";b.appendChild(el("div","empty","Loading orders…"));openD($("ordD"));
  api("/api/orders").then(function(r){b.textContent="";
    if(!r.orders.length){b.appendChild(el("div","empty","No orders yet. Your orders will appear here."));return}
    r.orders.forEach(function(o){var w=el("div","row ord"),t=el("div","t"),h=el("div","it");
      h.append(el("b",null,o.id+" · "+inr(o.total)),el("span","st",o.status));t.append(h,el("div","note",when(o.created)+" · "+o.payment));
      o.items.forEach(function(i){var li=el("div","it");li.appendChild(el("span",null,i.name+" × "+i.qty));if(o.status==="Delivered")li.appendChild(starRow(i));t.appendChild(li)});
      if(o.status==="Delivered")t.appendChild(el("div","note","Tap the stars to rate the products you received."));
      w.appendChild(t);b.appendChild(w)})
  }).catch(function(x){b.textContent="";b.appendChild(el("div","empty",x.message))})};

/* ---------- admin ---------- */
var adminTab="orders",STAT=["Placed","Paid","Shipped","Delivered","Cancelled"],PEND=["Placed","Paid","Shipped"];
$("adm").onclick=function(){adminTab="orders";openD($("admD"));adminLoad()};
function adminTabs(){var n=$("admT");n.textContent="";[["orders","Orders"],["customers","Customers"],["products","Products"]].forEach(function(a){
  var b=btn(a[1],"chip",function(){adminTab=a[0];adminLoad()});b.setAttribute("aria-pressed",String(adminTab===a[0]));n.appendChild(b)})}
function adminLoad(){adminTabs();var b=$("admB");b.textContent="";b.appendChild(el("div","empty","Loading…"));
  var p=adminTab==="orders"?api("/api/admin/orders").then(function(r){b.textContent="";ordersView(b,r.orders,true)})
    :adminTab==="customers"?api("/api/admin/customers").then(drawCustomers):api("/api/admin/products").then(drawProducts);
  p.catch(function(x){b.textContent="";b.appendChild(el("div","empty",x.message))})}
function ordersView(box,orders,showCust){
  var f="All",chips=el("div","cats chips"),list=el("div");
  function draw(){var c={Pending:0,Delivered:0,Cancelled:0};orders.forEach(function(o){if(PEND.indexOf(o.status)>-1)c.Pending++;else c[o.status]++});
    chips.textContent="";[["All",orders.length],["Pending",c.Pending],["Delivered",c.Delivered],["Cancelled",c.Cancelled]].forEach(function(a){
      var b=btn(a[0]+" ("+a[1]+")","chip",function(){f=a[0];draw()});b.setAttribute("aria-pressed",String(f===a[0]));chips.appendChild(b)});
    list.textContent="";var L=orders.filter(function(o){return f==="All"||(f==="Pending"?PEND.indexOf(o.status)>-1:o.status===f)});
    if(!L.length)list.appendChild(el("div","empty","No orders here."));
    L.forEach(function(o){list.appendChild(orderCard(o,showCust,draw))})}
  box.append(chips,list);draw()}
function orderCard(o,showCust,redraw){
  var w=el("div","row ord"),t=el("div","t");
  t.append(el("b",null,o.id+" · "+inr(o.total)));
  if(showCust)t.appendChild(btn(o.customer,"link",function(){openCustomer(o.uid)}));
  t.append(el("div",null,o.name+" · "+o.phone),el("div",null,o.address+", "+o.pin),el("div",null,o.items.map(function(i){return i.name+" × "+i.qty}).join(", ")),el("div","note",when(o.created)+" · "+o.payment));
  var sel=document.createElement("select");sel.className="auto";sel.setAttribute("aria-label","Order status");
  STAT.forEach(function(s){var op=el("option",null,s);op.value=s;sel.appendChild(op)});sel.value=o.status;
  sel.onchange=function(){api("/api/admin/status",{id:o.id,status:sel.value}).then(function(){o.status=sel.value;toast("Status updated");redraw()}).catch(function(x){sel.value=o.status;toast(x.message)})};
  var wa=el("a","link","Message customer on WhatsApp");wa.href="https://wa.me/91"+o.phone;wa.target="_blank";wa.rel="noopener";
  t.append(sel,wa);w.appendChild(t);return w}
function drawCustomers(r){var b=$("admB");b.textContent="";
  if(!r.customers.length){b.appendChild(el("div","empty","No customers yet."));return}
  r.customers.forEach(function(c){var w=el("div","row"),t=el("div","t");
    t.append(el("b",null,c.name),el("div","note",c.email),el("div",null,c.orders+" order"+(c.orders===1?"":"s")+" · "+inr(c.spent)+(c.last?" · last "+when(c.last):"")));
    w.append(t,btn("Orders","btn alt",function(){openCustomer(c.id)}));b.appendChild(w)})}
function openCustomer(id){adminTab="customers";adminTabs();var b=$("admB");b.textContent="";b.appendChild(el("div","empty","Loading…"));
  api("/api/admin/customers/"+id+"/orders").then(function(r){b.textContent="";
    b.append(btn("← All customers","btn alt",function(){adminLoad()}),el("h3",null,r.customer.name),el("div","note",r.customer.email));
    if(!r.orders.length)b.appendChild(el("div","empty","This customer has no orders."));else ordersView(b,r.orders,false)
  }).catch(function(x){b.textContent="";b.appendChild(el("div","empty",x.message))})}
function field(f,id,lab,val,numeric){var l=el("label",null,lab);l.htmlFor="pf-"+id;var i=document.createElement("input");i.id="pf-"+id;i.value=val;i.maxLength=80;if(numeric){i.type="number";i.inputMode="numeric"}f.append(l,i);return i}
function readPhoto(file,cb){var fr=new FileReader();fr.onload=function(){var im=new Image();im.onload=function(){
    var s=Math.min(1,700/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);
    var g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);cb(c.toDataURL("image/jpeg",0.8))};
    im.onerror=function(){cb(null)};im.src=fr.result};fr.onerror=function(){cb(null)};fr.readAsDataURL(file)}
function drawProducts(r){var b=$("admB");b.textContent="";b.appendChild(btn("Add product","btn",function(){productForm(null)}));
  r.products.forEach(function(p){var w=el("div","row"),t=el("div","t");t.append(el("div",null,p.n),el("b",null,inr(p.p)+(p.on?"":" · hidden")));
    w.append(mk(p),t,btn("Edit","btn alt",function(){productForm(p)}));b.appendChild(w)})}
function productForm(p){var b=$("admB");b.textContent="";var f=el("form");f.noValidate=true;
  var er=el("div","err");er.setAttribute("role","alert");
  var n=field(f,"n","Product name",p?p.n:""),c=field(f,"c","Category",p?p.c:""),pr=field(f,"p","Selling price (₹)",p?p.p:"",1),m=field(f,"m","MRP (₹)",p?p.m:"",1),e=field(f,"e","Emoji (shown if there is no photo)",p?p.e:"🛍️");
  var pl=el("label",null,"Photo");pl.htmlFor="pf-f";var fi=document.createElement("input");fi.type="file";fi.accept="image/*";fi.id="pf-f";f.append(pl,fi);
  var pv=document.createElement("img");pv.className="pv";pv.alt="";pv.hidden=!(p&&p.img);if(p&&p.img)pv.src=p.img;f.appendChild(pv);
  var photo=null,rm=null;
  fi.onchange=function(){if(!fi.files[0])return;readPhoto(fi.files[0],function(d){if(!d){er.textContent="Could not read that photo.";return}photo=d;pv.src=d;pv.hidden=false})};
  if(p&&p.img){var rl=el("label","inl");rm=document.createElement("input");rm.type="checkbox";rl.append(rm," Remove photo");f.appendChild(rl)}
  var al=el("label","inl"),ck=document.createElement("input");ck.type="checkbox";ck.checked=p?!!p.on:true;al.append(ck," Show in store");f.appendChild(al);
  var sv=el("button","btn","Save");sv.type="submit";f.append(er,sv,btn("Cancel","btn alt",adminLoad));
  if(p)f.appendChild(btn("Delete product","btn alt",function(){if(!confirm("Delete this product? If it has past orders it will only be hidden."))return;
    api("/api/admin/product-delete",{id:p.id}).then(function(r){toast(r.deleted?"Deleted":"Has past orders, so it was hidden instead");loadProducts().then(function(){renderCats();renderGrid();renderCart()});adminLoad()}).catch(function(x){er.textContent=x.message})}));
  f.onsubmit=function(ev){ev.preventDefault();er.textContent="";sv.disabled=true;
    var body={n:n.value,c:c.value,p:+pr.value,m:+m.value,e:e.value,active:ck.checked};if(p)body.id=p.id;
    var up=photo?api("/api/admin/image",{data:photo}).then(function(r){body.image_id=r.id}):Promise.resolve(rm&&rm.checked?(body.image_id=null):0);
    up.then(function(){return api("/api/admin/product",body)}).then(function(){toast("Saved");loadProducts().then(function(){renderCats();renderGrid();renderCart()});adminLoad()})
      .catch(function(x){er.textContent=x.message;sv.disabled=false})};
  b.appendChild(f)}

/* ---------- start ---------- */
api("/api/config").then(function(r){cfg=r;document.title=r.name;if(!r.upi&&!r.upiPhone){var o=$("py").querySelector("option[value=UPI]");if(o)o.remove()}}).catch(function(){});
loadProducts().then(function(){load();renderCats();renderGrid();renderCart()})
  .catch(function(){var g=$("grid");g.textContent="";g.appendChild(el("div","empty","Could not load products. If the shop was idle, wait a minute and refresh."))});
api("/api/me").then(function(r){setUser(r.user)}).catch(function(){});
})();

/* Bocadinho — código compartilhado por todas as páginas:
   estado da conta, sidebar (drawer), contador do carrinho e aviso de pedido em andamento. */
(()=>{
	const $=id=>document.getElementById(id);
	const CHAVE_CARRINHO='bocadinho_carrinho',CHAVE_PEDIDO='bocadinho_pedido';
	const VAZIO={cliente:null,cartao:null,pedidos:[]};
	let estado=VAZIO,abridor=null;
	const ouvintes=[];
	const el=(tag,texto,classe)=>{const n=document.createElement(tag);if(texto!==undefined)n.textContent=texto;if(classe)n.className=classe;return n};
	const post=caminho=>fetch('/api/conta'+caminho,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});

	/* ---------- estado da conta ---------- */
	async function carregar(){
		try{
			const r=await fetch('/api/conta',{cache:'no-store'});
			const d=await r.json().catch(()=>({}));
			estado=r.ok&&d.cliente?{cliente:d.cliente,cartao:d.cartao,pedidos:d.pedidos||[]}:VAZIO;
		}catch(_){estado=VAZIO}
		desenharDrawer();prepararCheckout();
		ouvintes.forEach(fn=>fn(estado));
	}

	/* ---------- carrinho e pedido em andamento (leitura apenas) ---------- */
	function itensNoCarrinho(){
		try{
			const d=JSON.parse(localStorage.getItem(CHAVE_CARRINHO));
			if(!d||d.v!==1||!d.itens||typeof d.itens!=='object')return 0;
			return Object.values(d.itens).reduce((s,n)=>s+(Number.isInteger(n)&&n>0?Math.min(n,99):0),0);
		}catch(_){return 0}
	}
	function atualizarNav(){
		const link=document.querySelector('[data-nav-cardapio]');
		if(link){const n=itensNoCarrinho();link.textContent=n?'Cardápio ('+n+')':'Cardápio'}
		const nav=document.querySelector('.site-nav');
		if(!nav)return;
		let pendente=false;
		try{pendente=Boolean(localStorage.getItem(CHAVE_PEDIDO))}catch(_){}
		let aviso=nav.querySelector('.nav-aviso');
		const naCardapio=/cardapio/.test(location.pathname);
		if(pendente&&!naCardapio){
			if(!aviso){aviso=el('a','⏳ Pedido em andamento','nav-aviso');aviso.href='/cardapio.html';nav.append(aviso)}
		}else if(aviso)aviso.remove();
	}

	/* ---------- sidebar ---------- */
	function montarDrawer(){
		const fundo=el('div','', 'drawer-fundo');fundo.hidden=true;
		const d=el('aside',undefined,'drawer');
		d.id='drawer-conta';d.hidden=true;d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-labelledby','drawer-titulo');
		const topo=el('div',undefined,'drawer-topo');
		const t=el('h2','Minha conta');t.id='drawer-titulo';
		const x=el('button','×','drawer-fechar');x.type='button';x.setAttribute('aria-label','Fechar menu da conta');
		topo.append(t,x);
		const corpo=el('div');corpo.id='drawer-corpo';corpo.style.display='grid';corpo.style.gap='14px';
		d.append(topo,corpo);
		document.body.append(fundo,d);
		fundo.addEventListener('click',fechar);x.addEventListener('click',fechar);
		d.addEventListener('keydown',e=>{
			if(e.key==='Escape'){e.preventDefault();fechar();return}
			if(e.key!=='Tab')return;
			const foco=[...d.querySelectorAll('a[href],button:not([disabled])')];
			if(!foco.length)return;
			const primeiro=foco[0],ultimo=foco[foco.length-1];
			if(e.shiftKey&&document.activeElement===primeiro){e.preventDefault();ultimo.focus()}
			else if(!e.shiftKey&&document.activeElement===ultimo){e.preventDefault();primeiro.focus()}
		});
	}
	function abrir(origem){
		abridor=origem||null;
		$('drawer-conta').hidden=false;document.querySelector('.drawer-fundo').hidden=false;
		document.body.style.overflow='hidden';
		$('drawer-conta').querySelector('.drawer-fechar').focus();
	}
	function fechar(){
		$('drawer-conta').hidden=true;document.querySelector('.drawer-fundo').hidden=true;
		document.body.style.overflow='';
		if(abridor)abridor.focus();
	}
	function link(texto,href,secundario){const a=el('a',texto,'btn'+(secundario?' btn-sec':''));a.href=href;return a}
	function desenharDrawer(){
		const corpo=$('drawer-corpo');
		if(!corpo)return;
		corpo.replaceChildren();
		const nav=document.querySelector('[data-abrir-conta]');
		if(nav)nav.textContent=estado.cliente?estado.cliente.nome.split(' ')[0]:'Minha conta';
		if(!estado.cliente){
			corpo.append(
				el('p','Crie sua conta e ganhe um cookie extra a cada 10 pedidos pagos.'),
				link('Entrar','/conta.html'),link('Criar conta','/conta.html#cadastro',true)
			);
			return;
		}
		const c=estado.cartao;
		corpo.append(el('p','Olá, '+estado.cliente.nome.split(' ')[0]+'!'));
		if(c){
			corpo.append(el('p','🍪 '+c.carimbos+' de '+c.meta+' carimbos'));
			const barra=el('div',undefined,'drawer-barra'),i=document.createElement('i');
			i.style.width=Math.round(c.carimbos/c.meta*100)+'%';barra.append(i);corpo.append(barra);
			if(c.brindes_disponiveis>0)corpo.append(el('p','🎁 Você tem '+c.brindes_disponiveis+' cookie(s) grátis para o próximo pedido!','drawer-brinde'));
			else corpo.append(el('p',c.faltam===1?'Falta 1 pedido para ganhar um cookie extra.':'Faltam '+c.faltam+' pedidos para ganhar um cookie extra.'));
		}
		corpo.append(link('Meu cartão e pedidos','/conta.html'),link('Fazer um pedido','/cardapio.html',true));
		const sair=el('button','Sair da conta','btn btn-sec');sair.type='button';
		sair.addEventListener('click',async()=>{try{await post('/logout')}catch(_){}await carregar()});
		corpo.append(sair);
	}

	/* ---------- checkout (só na página do cardápio) ---------- */
	function prepararCheckout(){
		const alvo=$('fid-checkout');
		if(!alvo)return;
		const c=estado.cliente,cartao=estado.cartao;
		if(c){
			[['nome',c.nome],['email',c.email],['telefone',c.telefone]].forEach(([id,valor])=>{const campo=$(id);if(campo&&!campo.value)campo.value=valor});
			if(cartao&&cartao.brindes_disponiveis>0){alvo.className='fid-banner ganho';alvo.textContent='🎁 Seu cookie grátis da fidelidade será adicionado a este pedido.'}
			else if(cartao){alvo.className='fid-banner convite';alvo.textContent='🍪 Este pedido soma 1 carimbo no seu cartão ('+cartao.carimbos+' de '+cartao.meta+').'}
		}else{
			alvo.className='fid-banner convite';
			alvo.innerHTML='🍪 A cada <b>10 pedidos</b> pagos você ganha um cookie extra. <a href="/conta.html#cadastro">Crie sua conta</a> antes de pedir para acumular carimbos.';
		}
		alvo.hidden=false;
	}

	/* ---------- animação de revelação nas páginas sem cardápio ---------- */
	function revelar(){
		const reduzir=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if($('items')||reduzir||!('IntersectionObserver' in window))return;
		const obs=new IntersectionObserver((es,o)=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');o.unobserve(e.target)}}),{threshold:.12});
		document.querySelectorAll('section:not(.hero),#destaques .card,.como .c,section img').forEach(n=>{n.classList.add('reveal');obs.observe(n)});
		document.documentElement.classList.add('motion-ready');
	}

	/* ---------- ganchos usados por app.js e conta.js ---------- */
	window.Conta={
		atualizar:carregar,
		estado:()=>estado,
		aoMudar:fn=>ouvintes.push(fn),
		anotarRevisao(area){
			if(!estado.cliente||!estado.cartao||estado.cartao.brindes_disponiveis<1)return;
			area.append(el('p','🎁 + 1 cookie grátis (fidelidade) será adicionado ao pedido.','review-brinde'));
		}
	};

	montarDrawer();
	document.querySelectorAll('[data-abrir-conta]').forEach(b=>b.addEventListener('click',()=>abrir(b)));
	window.addEventListener('bocadinho:carrinho',atualizarNav);
	window.addEventListener('storage',atualizarNav);
	atualizarNav();revelar();carregar();
})();

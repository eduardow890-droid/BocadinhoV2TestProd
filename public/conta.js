/* Bocadinho — página /conta.html: login, cadastro, cartão fidelidade e pedidos.
   O estado compartilhado e a sidebar ficam em comum.js. */
(()=>{
	const $=id=>document.getElementById(id);
	const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
	const brl=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
	const ROTULO={pendente:'Aguardando pagamento',pago:'Pago',em_preparo:'Em preparo',enviado:'Enviado',concluido:'Concluído',cancelado:'Cancelado',expirado:'Expirado',estornado:'Estornado',revisar:'Em análise'};

	async function api(caminho,corpo){
		const r=await fetch('/api/conta'+caminho,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corpo)});
		return {ok:r.ok,dados:await r.json().catch(()=>({}))};
	}

	function aba(nome){
		const entrar=nome!=='cadastro';
		$('aba-entrar').setAttribute('aria-selected',String(entrar));
		$('aba-cadastro').setAttribute('aria-selected',String(!entrar));
		$('form-entrar').hidden=!entrar;$('form-cadastro').hidden=entrar;
		$('erro-entrar').textContent='';$('erro-cadastro').textContent='';
	}

	function desenharCartao(c){
		const itens=[];
		for(let i=0;i<c.meta;i++){
			const ultimo=i===c.meta-1,cheio=i<c.carimbos;
			itens.push('<li class="'+(cheio?'cheio':'')+(ultimo&&!cheio?' premio':'')+'" aria-hidden="true">'+(cheio?'🍪':(ultimo?'🎁':''))+'</li>');
		}
		$('carimbos').innerHTML=itens.join('');
		$('carimbos').setAttribute('aria-label',c.carimbos+' de '+c.meta+' carimbos');
		const aviso=$('cartao-aviso');
		if(c.brindes_disponiveis>0){
			aviso.className='cartao-aviso';
			aviso.textContent=c.brindes_disponiveis>1?'🎁 Você tem '+c.brindes_disponiveis+' cookies grátis! Um é adicionado automaticamente em cada próximo pedido.':'🎁 Você tem 1 cookie grátis! Ele é adicionado automaticamente no seu próximo pedido.';
		}else{
			aviso.className='cartao-aviso vazio';
			aviso.textContent=c.faltam===1?'Falta 1 pedido para ganhar um cookie extra!':'Faltam '+c.faltam+' pedidos para ganhar um cookie extra.';
		}
		$('cartao-contagem').textContent=c.pedidos_pagos===1?'1 pedido pago até agora.':c.pedidos_pagos+' pedidos pagos até agora.';
	}

	function desenhar(estado){
		const logado=Boolean(estado.cliente);
		$('conta-entrada').hidden=logado;$('conta-logado').hidden=!logado;
		if(!logado)return;
		$('conta-nome').textContent=estado.cliente.nome.split(' ')[0];
		if(estado.cartao)desenharCartao(estado.cartao);
		const lista=$('conta-pedidos');
		lista.innerHTML=estado.pedidos.length?'<h4>Seus últimos pedidos</h4>'+estado.pedidos.map(p=>'<li><span>#'+esc(p.codigo)+' · '+new Date(p.criado_em).toLocaleDateString('pt-BR')+(p.brinde_fidelidade?' · 🎁':'')+'</span><span>'+brl(p.total_centavos)+' · '+esc(ROTULO[p.status]||p.status)+'</span></li>').join(''):'';
	}

	function marcar(form,campos){
		form.querySelectorAll('.is-invalid').forEach(c=>{c.classList.remove('is-invalid');c.removeAttribute('aria-invalid')});
		Object.keys(campos||{}).forEach(n=>{const c=form.querySelector('[name="'+n+'"]');if(c){c.classList.add('is-invalid');c.setAttribute('aria-invalid','true')}});
		const p=form.querySelector('.is-invalid');if(p)p.focus();
	}

	async function enviar(form,caminho,corpo,erroId,rotulo){
		const erro=$(erroId),btn=form.querySelector('button[type=submit]');
		erro.textContent='';btn.disabled=true;btn.textContent='Aguarde...';
		try{
			const {ok,dados}=await api(caminho,corpo());
			if(!ok){erro.textContent=dados.erro||'Não foi possível concluir. Tente novamente.';marcar(form,dados.campos);return}
			form.reset();
			await window.Conta.atualizar();
		}catch(_){erro.textContent='Sem conexão. Tente novamente.'}
		finally{btn.disabled=false;btn.textContent=rotulo}
	}

	const val=(f,n)=>f.elements[n].value;
	$('aba-entrar').addEventListener('click',()=>aba('entrar'));
	$('aba-cadastro').addEventListener('click',()=>aba('cadastro'));
	$('form-entrar').addEventListener('submit',e=>{e.preventDefault();const f=e.target;enviar(f,'/login',()=>({email:val(f,'email').trim(),senha:val(f,'senha')}),'erro-entrar','Entrar')});
	$('form-cadastro').addEventListener('submit',e=>{e.preventDefault();const f=e.target;enviar(f,'/cadastro',()=>({nome:val(f,'nome').trim(),email:val(f,'email').trim(),telefone:val(f,'telefone').trim(),senha:val(f,'senha'),aceite:f.elements.aceite.checked}),'erro-cadastro','Criar minha conta')});
	$('conta-sair').addEventListener('click',async()=>{try{await api('/logout',{})}catch(_){}await window.Conta.atualizar();aba('entrar')});
	window.Conta.aoMudar(desenhar);
	desenhar(window.Conta.estado());
	if(location.hash==='#cadastro')aba('cadastro');
})();

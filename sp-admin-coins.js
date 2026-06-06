// ============================================================
// SHADOW PHASE 影变 — admin: coins (top-up requests, manual add, payment settings)
// window.initCoinsAdmin({ flash })
// ============================================================
(function () {
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function fmtWhen(s){var d=new Date(s);var m=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];return d.getDate()+' '+m[d.getMonth()]+' '+(d.getFullYear()+543)+' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}

  window.initCoinsAdmin = function (opts) {
    var SP = window.SP;
    var flash = (opts && opts.flash) || function(){};
    var stTh = { pending:'รอตรวจสอบ', done:'เติมแล้ว', rejected:'ปฏิเสธ' };

    async function renderTopups(){
      var el = document.getElementById('topupList');
      var list = await SP.listTopups();
      list.sort(function(a,b){
        if ((a.status==='pending')!==(b.status==='pending')) return a.status==='pending'?-1:1;
        return new Date(b.date)-new Date(a.date);
      });
      if (!list.length){ el.innerHTML = '<div class="admin-empty">ยังไม่มีคำขอเติมเหรียญ</div>'; return; }
      el.innerHTML = list.map(function(t){
        var pending = (t.status||'pending')==='pending';
        return '<div class="admin-row">'+
          '<div class="ar-body">'+
            '<div class="ar-title">'+esc(t.name||t.email||'ผู้ใช้')+' <span class="chap-paid">฿'+t.amount+' → '+t.coins+' เหรียญ</span></div>'+
            '<div class="ar-meta">'+esc(t.email||'')+' · '+fmtWhen(t.date)+' · <span class="tu-st '+(t.status||'pending')+'">'+(stTh[t.status]||'รอตรวจสอบ')+'</span></div>'+
          '</div>'+
          '<div class="chap-acts">'+
            (pending
              ? '<button class="ar-del ar-edit" data-ok="'+t.id+'" type="button">อนุมัติ</button><button class="ar-del" data-no="'+t.id+'" type="button">ปฏิเสธ</button>'
              : '')+
          '</div>'+
        '</div>';
      }).join('');
      el.querySelectorAll('[data-ok]').forEach(function(b){
        b.onclick = function(){
          b.disabled = true; b.textContent = 'กำลังเติม…';
          Promise.resolve(SP.approveTopup(b.dataset.ok)).then(function(r){
            if (r && r.ok === false){ b.disabled=false; b.textContent='อนุมัติ'; flash('flashCoins', r.msg || 'อนุมัติไม่สำเร็จ'); return; }
            flash('flashCoins','อนุมัติและเติมเหรียญเรียบร้อย');
            renderTopups(); renderUsers();
          });
        };
      });
      el.querySelectorAll('[data-no]').forEach(function(b){
        b.onclick = function(){ if(!confirm('ปฏิเสธคำขอนี้?')) return;
          Promise.resolve(SP.rejectTopup(b.dataset.no)).then(function(){ renderTopups(); });
        };
      });
    }

    var usersCache = [];
    async function renderUsers(){
      var el = document.getElementById('userList');
      usersCache = await SP.listUsers();
      usersCache.sort(function(a,b){ return (b.coins||0)-(a.coins||0); });
      var sel = document.getElementById('manualUser');
      sel.innerHTML = usersCache.map(function(u){ return '<option value="'+esc(u.uid)+'">'+esc(u.name||u.email)+' ('+(u.coins||0)+')</option>'; }).join('');
      if (!usersCache.length){ el.innerHTML = '<div class="admin-empty">ยังไม่มีสมาชิก</div>'; return; }
      el.innerHTML = usersCache.map(function(u){
        return '<div class="admin-row">'+
          '<div class="ar-body">'+
            '<div class="ar-title">'+esc(u.name||u.email)+(u.role==='admin'?' <span class="chap-free">แอดมิน</span>':'')+'</div>'+
            '<div class="ar-meta">'+esc(u.email||'')+'</div>'+
          '</div>'+
          '<div class="user-coins">'+(u.coins||0)+' <span style="color:var(--ink-faint);font-size:.8rem">เหรียญ</span></div>'+
        '</div>';
      }).join('');
    }

    document.getElementById('manualForm').onsubmit = function(e){
      e.preventDefault();
      var uid = document.getElementById('manualUser').value;
      var amt = parseInt(document.getElementById('manualAmt').value,10);
      if (!uid || !amt){ flash('flashCoins','เลือกผู้ใช้และจำนวนเหรียญ'); return; }
      var btn = document.getElementById('manualBtn'); btn.disabled = true;
      Promise.resolve(SP.addCoins(uid, amt)).then(function(r){
        btn.disabled = false;
        if (r && r.ok === false){ flash('flashCoins', r.msg || 'ไม่สำเร็จ'); return; }
        document.getElementById('manualAmt').value = '';
        flash('flashCoins', (amt>0?'เติม ':'หัก ')+Math.abs(amt)+' เหรียญเรียบร้อย');
        renderUsers();
      });
    };

    var payForm = document.getElementById('payForm');
    function pkgToText(pkgs){ return (pkgs||[]).map(function(p){ return p.amount+','+p.coins+','+(p.bonus||''); }).join('\n'); }
    function textToPkg(t){
      return (t||'').split('\n').map(function(l){ return l.trim(); }).filter(Boolean).map(function(l){
        var parts = l.split(','); return { amount: parseInt(parts[0],10)||0, coins: parseInt(parts[1],10)||0, bonus: (parts[2]||'').trim() };
      }).filter(function(p){ return p.amount>0 && p.coins>0; });
    }
    SP.getPayment().then(function(p){
      payForm.coinName.value = p.coinName || '';
      payForm.pricePerChapter.value = p.pricePerChapter || 1;
      payForm.promptpay.value = p.promptpay || '';
      payForm.accountName.value = p.accountName || '';
      payForm.bankInfo.value = p.bankInfo || '';
      payForm.note.value = p.note || '';
      document.getElementById('pkgText').value = pkgToText(p.packages);
    });
    payForm.onsubmit = function(e){
      e.preventDefault();
      var obj = {
        coinName: payForm.coinName.value.trim() || 'เหรียญ',
        pricePerChapter: Math.max(1, parseInt(payForm.pricePerChapter.value,10)||1),
        promptpay: payForm.promptpay.value.trim(),
        accountName: payForm.accountName.value.trim(),
        bankInfo: payForm.bankInfo.value.trim(),
        note: payForm.note.value.trim(),
        packages: textToPkg(document.getElementById('pkgText').value)
      };
      var btn = document.getElementById('payBtn'); btn.disabled = true;
      Promise.resolve(SP.savePayment(obj)).then(function(r){
        btn.disabled = false;
        if (r && r.ok === false){ flash('flashCoins', r.msg || 'บันทึกไม่สำเร็จ'); return; }
        flash('flashCoins','บันทึกการตั้งค่าการชำระเงินแล้ว');
      });
    };

    renderTopups();
    renderUsers();
  };
})();

// ============================================================
// SHADOW PHASE 影变 — shared comments widget
// Mounts the comment thread (compose box + list + likes) into any element.
// Used by the novel chapter reader; identical UX to the article reader.
//   SP.mountComments(containerEl, threadKey)
// threadKey is the value stored in each comment's `slug` field, so different
// threads (articles, novel chapters) never collide.
// ============================================================
(function () {
  var SP = window.SP;
  if (!SP) return;

  var THAI = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  function fmtDate(s){ var d=new Date(s); return d.getDate()+' '+THAI[d.getMonth()]+' '+(d.getFullYear()+543); }
  function cEsc(s){ return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function cWhen(iso){ var d=new Date(iso); return fmtDate(iso)+' · '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }

  SP.mountComments = function (cEl, threadKey) {
    if (!cEl) return;

    async function render(){
      var list = await SP.listComments(threadKey), s = SP.session(), admin = SP.isAdmin();
      var html = '<div class="c-head"><h2>ความคิดเห็น</h2><span class="c-count">'+list.length+'</span><span class="cn">评论</span></div>';
      if (s) {
        html += '<div class="c-compose">'+
          '<span class="sp-ava">'+cEsc((s.name||s.email).slice(0,1))+'</span>'+
          '<div class="c-box">'+
            '<textarea class="sp-textarea" id="cInput" placeholder="ร่วมแลกเปลี่ยนความคิดเห็น..."></textarea>'+
            '<div class="c-row"><span class="c-as">แสดงความคิดเห็นในชื่อ <b>'+cEsc(s.name||s.email)+'</b></span>'+
            '<button class="btn btn-primary" id="cSend" type="button">ส่งความคิดเห็น</button></div>'+
          '</div></div>';
      } else {
        html += '<div class="c-locked"><p>เข้าสู่ระบบเป็นสมาชิกเพื่อร่วมแสดงความคิดเห็นใต้ตอนนี้</p>'+
          '<button class="btn btn-primary" id="cLogin" type="button">เข้าสู่ระบบ / สมัคร</button></div>';
      }
      if (list.length) {
        html += '<div class="c-list">'+list.map(function(c){
          var isAdmin = c.role==='admin';
          var canDel = admin || (s && c.uid===s.uid);
          var likes = c.likes || [];
          var liked = !!(s && likes.indexOf(s.uid)>-1);
          var cnt = likes.length;
          return '<div class="c-item">'+
            '<span class="sp-ava"'+(isAdmin?' style="background:var(--crimson)"':'')+'>'+cEsc((c.name||'?').slice(0,1))+'</span>'+
            '<div class="c-body"><div class="c-by"><span class="nm">'+cEsc(c.name||'ผู้ใช้')+'</span>'+
              (isAdmin?'<span class="badge">แอดมิน</span>':'')+
              (s && c.uid===s.uid && !isAdmin?'<span class="badge mine">คุณ</span>':'')+
              '<span class="when">'+cWhen(c.date)+'</span>'+
              (canDel?'<button class="c-del" data-id="'+c.id+'" type="button">ลบ</button>':'')+
            '</div><div class="c-text">'+cEsc(c.text).replace(/\n/g,'<br>')+'</div>'+
            '<div class="c-foot"><button class="c-like'+(liked?' liked':'')+'" data-id="'+c.id+'" data-liked="'+(liked?'1':'')+'" type="button" aria-pressed="'+liked+'">'+
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5l-1.3-1.2C6 14.9 3 12.2 3 8.9 3 6.3 5 4.3 7.6 4.3c1.5 0 2.9.7 3.8 1.8.9-1.1 2.3-1.8 3.8-1.8C17.8 4.3 19.8 6.3 19.8 8.9c0 3.3-3 6-6.7 10.4z"/></svg>'+
              '<span class="c-like-n">'+(cnt||'')+'</span></button></div>'+
            '</div></div>';
        }).join('')+'</div>';
      } else {
        html += '<div class="c-empty">ยังไม่มีความคิดเห็น — มาเป็นคนแรกที่ร่วมแลกเปลี่ยน</div>';
      }
      cEl.innerHTML = html;

      var send = document.getElementById('cSend');
      if (send) send.onclick = function(){
        var inp = document.getElementById('cInput');
        send.disabled = true;
        Promise.resolve(SP.addComment(threadKey, inp.value)).then(function(r){
          send.disabled = false;
          if (r.ok) render(); else alert(r.msg);
        });
      };
      var lg = document.getElementById('cLogin');
      if (lg) lg.onclick = function(){ SP.openAuth(); };
      cEl.querySelectorAll('.c-del').forEach(function(b){
        b.onclick = function(){ if(confirm('ลบความคิดเห็นนี้?')){ Promise.resolve(SP.deleteComment(b.dataset.id)).then(render); } };
      });
      cEl.querySelectorAll('.c-like').forEach(function(b){
        b.onclick = function(){
          if(!SP.session()){ SP.openAuth(); return; }
          b.disabled = true;
          Promise.resolve(SP.toggleLike(b.dataset.id, b.dataset.liked==='1')).then(render);
        };
      });
    }

    SP.onAuth(function(){ render(); });
    render();
  };
})();

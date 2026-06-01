// ============================================================
// SHADOW PHASE 影变 — admin: novel & chapter management
// Exposes window.initNovelAdmin({ flash }) — called from admin.html boot().
// Novels are stored as one document (chapters embedded), so every chapter
// edit re-saves the whole novel via SP.saveNovel().
// ============================================================
(function () {
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function fmtDate(s){var d=new Date(s);var m=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];return d.getDate()+' '+m[d.getMonth()]+' '+(d.getFullYear()+543);}

  window.initNovelAdmin = function (opts) {
    var SP = window.SP, ST = window.SP_NOVEL_STATUS || {};
    var flash = (opts && opts.flash) || function(){};

    var novForm = document.getElementById('novForm');
    var chapForm = document.getElementById('chapForm');
    var coverUrl = '';
    var editing = null; // the novel object being edited (null = creating new)

    // ---------- cover ----------
    function setCover(url){
      coverUrl = url || '';
      var prev = document.getElementById('novCoverPrev');
      if (coverUrl){ prev.style.display=''; prev.querySelector('img').src = coverUrl; }
      else { prev.style.display='none'; prev.querySelector('img').removeAttribute('src'); }
    }
    document.getElementById('novCover').oninput = function(){ setCover(this.value.trim()); };
    document.getElementById('novCoverClear').onclick = function(){ document.getElementById('novCover').value=''; setCover(''); };
    document.getElementById('novCoverFile').onchange = function(){
      var f = this.files && this.files[0]; if(!f) return;
      var btn = document.getElementById('novCoverBtn'); var t = btn.textContent; btn.textContent='กำลังอัปโหลด…';
      var self = this;
      Promise.resolve(SP.uploadImage(f)).then(function(url){
        document.getElementById('novCover').value = url; setCover(url); btn.textContent = t; self.value='';
      }).catch(function(){ btn.textContent = t; alert('อัปโหลดรูปไม่สำเร็จ'); });
    };

    // ---------- novel form ----------
    function resetNovel(){
      novForm.reset(); setCover('');
      editing = null;
      document.getElementById('novSlug').value='';
      document.getElementById('novModeBar').style.display='none';
      document.getElementById('novSubmit').textContent='สร้างนิยาย';
      document.getElementById('chapMgr').style.display='none';
      resetChap();
    }
    document.getElementById('novCancel').onclick = resetNovel;

    function loadNovel(n){
      editing = JSON.parse(JSON.stringify(n)); // deep copy incl. chapters
      if (!editing.chapters) editing.chapters = [];
      novForm.title.value = n.title || '';
      novForm.cn.value = n.cn || '';
      novForm.status.value = n.status || 'ongoing';
      novForm.synopsis.value = n.synopsis || '';
      document.getElementById('novCover').value = n.cover || ''; setCover(n.cover||'');
      document.getElementById('novSlug').value = n.slug;
      document.getElementById('novModeBar').style.display='';
      document.getElementById('novSubmit').textContent='บันทึกข้อมูลเรื่อง';
      document.getElementById('chapMgr').style.display='';
      resetChap();
      renderChapters();
      window.scrollTo({top:0,behavior:'smooth'});
    }

    novForm.onsubmit = function(e){
      e.preventDefault();
      var title = novForm.title.value.trim();
      var slug = document.getElementById('novSlug').value || SP.makeSlug(title);
      var chapters = editing ? (editing.chapters || []) : [];
      var obj = {
        slug: slug,
        title: title,
        cn: novForm.cn.value.trim(),
        cover: coverUrl || '',
        status: novForm.status.value,
        synopsis: novForm.synopsis.value.trim(),
        date: (editing && editing.date) || new Date().toISOString(),
        updated: new Date().toISOString(),
        chapters: chapters
      };
      var btn = document.getElementById('novSubmit'); btn.disabled = true;
      Promise.resolve(SP.saveNovel(obj)).then(function(r){
        btn.disabled = false;
        if (r && r.ok === false){ flash('flashNovel', r.msg || 'บันทึกไม่สำเร็จ'); return; }
        flash('flashNovel', (editing?'บันทึกเรื่อง “':'สร้างนิยาย “')+title+'” แล้ว — ตอนนี้เพิ่มตอนได้เลย');
        loadNovel(obj);     // stay in edit mode so chapters can be added
        renderNovels();
      });
    };

    // ---------- chapters ----------
    function resetChap(){
      chapForm.reset();
      document.getElementById('chapIdx').value='';
      document.getElementById('chapModeBar').style.display='none';
      document.getElementById('chapSubmit').textContent='เพิ่มตอน';
    }
    document.getElementById('chapCancel').onclick = resetChap;

    function renderChapters(){
      var el = document.getElementById('chapList');
      var chs = (editing && editing.chapters) || [];
      if (!chs.length){ el.innerHTML = '<div class="admin-empty">ยังไม่มีตอน — เพิ่มตอนแรกด้านล่าง</div>'; return; }
      el.innerHTML = chs.map(function(c,i){
        return '<div class="admin-row">'+
          '<div class="ar-body">'+
            '<div class="ar-title"><span class="chap-n">'+(i+1)+'.</span> '+esc(c.title||('ตอนที่ '+(i+1)))+'</div>'+
            '<div class="ar-meta">'+fmtDate(c.date||editing.date)+' · '+((c.body||[]).length)+' บล็อก</div>'+
          '</div>'+
          '<div class="chap-acts">'+
            '<button class="ar-del" data-up="'+i+'" type="button" '+(i===0?'disabled':'')+' aria-label="เลื่อนขึ้น">↑</button>'+
            '<button class="ar-del" data-down="'+i+'" type="button" '+(i===chs.length-1?'disabled':'')+' aria-label="เลื่อนลง">↓</button>'+
            '<button class="ar-del ar-edit" data-edit="'+i+'" type="button">แก้ไข</button>'+
            '<button class="ar-del" data-del="'+i+'" type="button">ลบ</button>'+
          '</div>'+
        '</div>';
      }).join('');
      el.querySelectorAll('[data-edit]').forEach(function(b){ b.onclick=function(){ loadChap(parseInt(b.dataset.edit,10)); }; });
      el.querySelectorAll('[data-del]').forEach(function(b){ b.onclick=function(){ delChap(parseInt(b.dataset.del,10)); }; });
      el.querySelectorAll('[data-up]').forEach(function(b){ b.onclick=function(){ moveChap(parseInt(b.dataset.up,10),-1); }; });
      el.querySelectorAll('[data-down]').forEach(function(b){ b.onclick=function(){ moveChap(parseInt(b.dataset.down,10),1); }; });
    }

    function persist(msg){
      editing.updated = new Date().toISOString();
      return Promise.resolve(SP.saveNovel(editing)).then(function(r){
        if (r && r.ok === false){ flash('flashNovel', r.msg || 'บันทึกไม่สำเร็จ'); return false; }
        if (msg) flash('flashNovel', msg);
        renderChapters(); renderNovels();
        return true;
      });
    }

    function loadChap(i){
      var c = editing.chapters[i]; if(!c) return;
      chapForm.title.value = c.title || '';
      chapForm.body.value = SP.bodyToText(c.body);
      document.getElementById('chapIdx').value = i;
      document.getElementById('chapModeBar').style.display='';
      document.getElementById('chapSubmit').textContent='บันทึกตอน';
      chapForm.scrollIntoView ? null : null;
      window.scrollTo({top:document.getElementById('chapForm').offsetTop-40,behavior:'smooth'});
    }
    function delChap(i){
      if (!confirm('ลบตอนนี้?')) return;
      editing.chapters.splice(i,1);
      persist('ลบตอนแล้ว'); resetChap();
    }
    function moveChap(i,dir){
      var j = i+dir; var a = editing.chapters;
      if (j<0 || j>=a.length) return;
      var tmp = a[i]; a[i]=a[j]; a[j]=tmp;
      persist();
    }

    chapForm.onsubmit = function(e){
      e.preventDefault();
      var idx = document.getElementById('chapIdx').value;
      var ch = {
        title: chapForm.title.value.trim(),
        body: SP.parseBody(chapForm.body.value),
        date: new Date().toISOString()
      };
      if (idx !== ''){ ch.date = editing.chapters[idx].date || ch.date; editing.chapters[idx] = ch; }
      else { editing.chapters.push(ch); }
      var btn = document.getElementById('chapSubmit'); btn.disabled = true;
      persist(idx!==''?'บันทึกตอนแล้ว':'เพิ่มตอนแล้ว').then(function(){ btn.disabled=false; resetChap(); });
    };

    // ---------- novel list ----------
    async function renderNovels(){
      var all = await SP.listNovels();
      var custom = await SP.customNovels();
      var stored = {}; custom.forEach(function(n){ stored[n.slug]=1; });
      var el = document.getElementById('novList');
      if (!all.length){ el.innerHTML = '<div class="admin-empty">ยังไม่มีนิยาย</div>'; return; }
      el.innerHTML = all.map(function(n){
        var isStored = stored[n.slug];
        var st = ST[n.status] || ST.ongoing;
        return '<div class="admin-row">'+
          (n.cover?'<img class="ar-thumb" src="'+esc(n.cover)+'" alt="">':'')+
          '<div class="ar-body">'+
            '<div class="ar-title">'+esc(n.title)+(isStored?'':' <span class="ar-base">ตั้งต้น</span>')+'</div>'+
            '<div class="ar-meta">'+st.th+' · '+((n.chapters||[]).length)+' ตอน · '+fmtDate(n.updated||n.date)+'</div>'+
          '</div>'+
          '<div class="chap-acts">'+
            '<button class="ar-del ar-edit" data-manage="'+esc(n.slug)+'" type="button">จัดการ</button>'+
            (isStored?'<button class="ar-del" data-del="'+esc(n.slug)+'" type="button">ลบ</button>':'')+
          '</div>'+
        '</div>';
      }).join('');
      el.querySelectorAll('[data-manage]').forEach(function(b){
        b.onclick = function(){ loadNovel(all.find(function(x){return x.slug===b.dataset.manage;})); };
      });
      el.querySelectorAll('[data-del]').forEach(function(b){
        b.onclick = function(){ if(confirm('ลบนิยายเรื่องนี้ทั้งเรื่อง? (รวมทุกตอน)')){ Promise.resolve(SP.deleteNovel(b.dataset.del)).then(function(){ if(editing&&editing.slug===b.dataset.del) resetNovel(); renderNovels(); }); } };
      });
    }

    renderNovels();
  };
})();

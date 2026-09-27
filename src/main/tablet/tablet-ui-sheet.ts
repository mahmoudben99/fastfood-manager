/**
 * Waiter page — options sheet: modifier groups (radio / multi / quantity, required + min/max
 * rules from the server) and the combo builder (slots, default picks, sold-out choices greyed, the
 * chosen item's own options inline). Shares the closure of tablet-ui-script.ts (ES5, String.raw:
 * never use a dollar-brace or backticks here). Prices shown are estimates; the server re-prices.
 */
export const TABLET_SHEET_SCRIPT = String.raw`
var sheet = null;

function copy(o) { return JSON.parse(JSON.stringify(o)); }
function unitsIn(p) { var n = 0; for (var k in p) if (p.hasOwnProperty(k)) n += p[k]; return n; }
function defaultsFor(groups) {
  var picks = {};
  (groups || []).forEach(function (g) {
    var p = {}, n = 0;
    g.options.forEach(function (o) { if (o.is_default && (g.max_select == null || n < g.max_select)) { p[o.id] = 1; n++; } });
    picks[g.id] = p;
  });
  return picks;
}
function childKey(slotId, itemId) { return slotId + ':' + itemId; }
function groupsFor(scope) {
  if (scope === 'main') return sheet.data.groups || [];
  return (sheet.data.child_groups || {})[scope.split(':')[1]] || [];
}
function picksFor(scope) {
  if (scope === 'main') return sheet.picks;
  if (!sheet.child[scope]) sheet.child[scope] = defaultsFor(groupsFor(scope));
  return sheet.child[scope];
}
function findSlot(id) { var s = (sheet.data.combo && sheet.data.combo.slots) || []; for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i]; return null; }
function findChoice(slot, itemId) { for (var i = 0; i < slot.choices.length; i++) if (slot.choices[i].menu_item_id === itemId) return slot.choices[i]; return null; }
function findGroup(scope, gid) { var g = groupsFor(scope); for (var i = 0; i < g.length; i++) if (g[i].id === gid) return g[i]; return null; }

function openSheet(item, editIndex) {
  var line = editIndex == null ? null : cart[editIndex];
  sheet = { item: item, data: null, qty: line ? line.qty : 1, picks: {}, slots: {}, child: {}, edit: editIndex, failed: false };
  $('sheet').hidden = false; syncScrim(); renderSheet();
  api('GET', '/api/items/' + item.id + '/options').then(function (r) {
    if (!sheet || sheet.item !== item) return;
    if (!r.ok) {
      closeSheet(); toast(t('unavailable_toast', { item: nameOf(item) }));
      if (r.status === 404 || r.status === 409) loadMenu();
      return;
    }
    sheet.data = r.data;
    if (line && line.config) {
      sheet.picks = copy(line.config.picks); sheet.slots = copy(line.config.slots); sheet.child = copy(line.config.child);
    } else {
      sheet.picks = defaultsFor(r.data.groups);
      ((r.data.combo && r.data.combo.slots) || []).forEach(function (slot) {
        var chosen = [];
        slot.choices.forEach(function (c) { if (c.is_default && !c.sold_out && chosen.length < slot.max_select) chosen.push(c.menu_item_id); });
        sheet.slots[slot.id] = chosen;
      });
    }
    renderSheet();
  }).catch(function () { if (sheet && sheet.item === item) { sheet.failed = true; renderSheet(); } });
}
function closeSheet() { sheet = null; $('sheet').hidden = true; $('sheet').innerHTML = ''; syncScrim(); }

function ruleText(min, max) {
  if (min > 0 && max === min) return t('rule_exactly', { n: min });
  if (min > 0 && max == null) return t('rule_min', { n: min });
  if (min > 0) return t('rule_range', { min: min, max: max });
  if (max != null) return t('rule_upto', { n: max });
  return t('rule_any');
}
function optLabel(o) {
  var n = esc(nameOf(o));
  if (o.kind === 'no') return '<span class="no">' + esc(t('no_prefix')) + '</span> ' + n;
  if (o.kind === 'extra') return '+&nbsp;' + n;
  if (o.kind === 'light') return esc(t('light_prefix')) + ' ' + n;
  return n;
}
function deltaText(d) { return d ? (d > 0 ? '+' : '−') + num(Math.abs(d)) : ''; }

function groupHtml(g, scope) {
  var p = picksFor(scope)[g.id] || {}, units = unitsIn(p), radio = g.max_select === 1;
  var state = units < g.min_select ? ' need' : g.min_select > 0 ? ' met' : '';
  var html = '<div class="grp' + state + '"><div class="grp-h"><b>' + esc(nameOf(g)) + '</b><span class="rule' + (g.min_select > 0 ? ' req' : '') + '">' +
    esc((g.min_select > 0 ? t('required') + ' · ' : '') + ruleText(g.min_select, g.max_select)) + '</span></div><div class="opts">';
  g.options.forEach(function (o) {
    var q = p[o.id] || 0;
    var stepper = q > 0 && g.allow_quantity && g.max_quantity > 1;
    html += '<div class="opt tap' + (radio ? ' radio' : '') + (o.kind === 'no' ? ' no' : '') + (stepper ? ' has-q' : '') + '" role="button" tabindex="0" data-act="opt" data-scope="' +
      scope + '" data-g="' + g.id + '" data-o="' + o.id + '" aria-pressed="' + String(q > 0) + '"><span class="mk">✓</span><span class="lb">' +
      optLabel(o) + '</span>';
    if (stepper) {
      html += '<span class="mini"><button data-act="optq" data-d="-1" aria-label="-">−</button><span>' + q +
        '</span><button data-act="optq" data-d="1" aria-label="+">+</button></span>';
    } else if (o.price_delta) html += '<span class="dp">' + deltaText(o.price_delta) + '</span>';
    html += '</div>';
  });
  return html + '</div></div>';
}
function slotHtml(slot) {
  var chosen = sheet.slots[slot.id] || [], radio = slot.max_select === 1;
  var html = '<div class="grp' + (chosen.length < slot.min_select ? ' need' : slot.min_select > 0 ? ' met' : '') + '"><div class="grp-h"><b>' +
    esc(nameOf(slot)) + '</b><span class="rule' + (slot.min_select > 0 ? ' req' : '') + '">' + esc(ruleText(slot.min_select, slot.max_select)) +
    '</span></div><div class="opts">';
  slot.choices.forEach(function (c) {
    var on = chosen.indexOf(c.menu_item_id) >= 0;
    html += '<div class="opt tap' + (radio ? ' radio' : '') + '" role="button" tabindex="0" data-act="pick" data-s="' + slot.id + '" data-i="' +
      c.menu_item_id + '" aria-pressed="' + String(on) + '"' + (c.sold_out ? ' aria-disabled="true"' : '') + '><span class="mk">✓</span>' +
      (c.emoji ? '<span class="em">' + esc(c.emoji) + '</span>' : '') + '<span class="lb">' + esc(nameOf(c)) + '</span>' +
      (c.sold_out ? '<span class="dp">' + esc(t('sold_out')) + '</span>' : c.upcharge ? '<span class="dp">' + deltaText(c.upcharge) + '</span>' : '') + '</div>';
  });
  html += '</div>';
  chosen.forEach(function (itemId) {
    var groups = (sheet.data.child_groups || {})[itemId], c = findChoice(slot, itemId);
    if (!groups || !groups.length || !c) return;
    var scope = childKey(slot.id, itemId);
    html += '<div class="child"><h4>' + esc(t('options_of', { item: nameOf(c) })) + '</h4>' +
      groups.map(function (g) { return groupHtml(g, scope); }).join('') + '</div>';
  });
  return html + '</div>';
}

function scopeDeltas(scope) {
  var sum = 0, picks = picksFor(scope);
  groupsFor(scope).forEach(function (g) {
    var p = picks[g.id] || {};
    g.options.forEach(function (o) { if (p[o.id]) sum += (Number(o.price_delta) || 0) * p[o.id]; });
  });
  return sum;
}
function sheetUnit() {
  var unit = priceFor(sheet.item) + scopeDeltas('main');
  ((sheet.data.combo && sheet.data.combo.slots) || []).forEach(function (slot) {
    (sheet.slots[slot.id] || []).forEach(function (itemId) {
      var c = findChoice(slot, itemId);
      unit += (c ? Number(c.upcharge) || 0 : 0);
      if ((sheet.data.child_groups || {})[itemId]) unit += scopeDeltas(childKey(slot.id, itemId));
    });
  });
  return Math.max(0, unit);
}
function firstUnmet() {
  var miss = null;
  function check(groups, scope) {
    groups.forEach(function (g) { if (!miss && unitsIn(picksFor(scope)[g.id] || {}) < g.min_select) miss = nameOf(g); });
  }
  check(sheet.data.groups || [], 'main');
  ((sheet.data.combo && sheet.data.combo.slots) || []).forEach(function (slot) {
    var chosen = sheet.slots[slot.id] || [];
    if (!miss && chosen.length < slot.min_select) miss = nameOf(slot);
    chosen.forEach(function (itemId) {
      var groups = (sheet.data.child_groups || {})[itemId];
      if (groups) check(groups, childKey(slot.id, itemId));
    });
  });
  return miss;
}

function renderSheet() {
  if (!sheet) return;
  var item = sheet.item, el = $('sheet');
  var head = '<div class="sh-head" style="--cat:' + catVar(item.category_id) + '"><div class="art">' + artOf(item) + '</div><div class="t"><h3>' +
    esc(nameOf(item)) + '</h3><div class="base">' + money(priceFor(item)) + '</div></div><button class="icon-btn tap" data-act="closeSheet" aria-label="' +
    esc(t('close')) + '">✕</button></div>';
  if (!sheet.data) {
    el.innerHTML = head + '<div class="sh-body">' + (sheet.failed
      ? '<div class="empty"><b>' + esc(t('err_network')) + '</b></div>'
      : '<div class="skel"></div><div class="skel"></div><div class="skel"></div>') + '</div>';
    return;
  }
  var body = (sheet.data.groups || []).map(function (g) { return groupHtml(g, 'main'); }).join('') +
    ((sheet.data.combo && sheet.data.combo.slots) || []).map(slotHtml).join('');
  var miss = firstUnmet(), total = sheetUnit() * sheet.qty;
  var label = miss ? esc(t('need', { what: miss })) : esc(t(sheet.edit == null ? 'add' : 'update')) + ' · ' + money(total);
  var scroll = el.querySelector('.sh-body') ? el.querySelector('.sh-body').scrollTop : 0;
  el.innerHTML = head + '<div class="sh-body">' + body + '</div><div class="sh-foot"><div class="step"><button data-act="sqty" data-d="-1" aria-label="-">−</button><span>' +
    sheet.qty + '</span><button data-act="sqty" data-d="1" aria-label="+">+</button></div><button class="btn ember tap" data-act="confirm"' +
    (miss ? ' disabled' : '') + '>' + label + '</button></div>';
  el.querySelector('.sh-body').scrollTop = scroll;
}

function toggleOpt(scope, gid, oid) {
  var g = findGroup(scope, gid);
  if (!g) return;
  var all = picksFor(scope), p = all[gid] || {};
  if (p[oid]) {
    if (!(g.max_select === 1 && g.min_select > 0)) delete p[oid];
  } else if (g.max_select === 1) {
    p = {}; p[oid] = 1;
  } else if (g.max_select != null && unitsIn(p) >= g.max_select) {
    toast(t('max_reached', { n: g.max_select, group: nameOf(g) })); return;
  } else p[oid] = 1;
  all[gid] = p; renderSheet();
}
function optQty(scope, gid, oid, d) {
  var g = findGroup(scope, gid), p = picksFor(scope)[gid] || {};
  if (!g || !p[oid]) return;
  var next = p[oid] + d;
  if (next <= 0) { if (g.min_select > 0 && unitsIn(p) <= g.min_select) return; delete p[oid]; }
  else if (next > g.max_quantity || (g.max_select != null && d > 0 && unitsIn(p) >= g.max_select)) {
    toast(t('max_reached', { n: g.max_select != null ? g.max_select : g.max_quantity, group: nameOf(g) })); return;
  } else p[oid] = next;
  renderSheet();
}
function togglePick(slotId, itemId) {
  var slot = findSlot(slotId), c = slot && findChoice(slot, itemId);
  if (!slot || !c || c.sold_out) { if (c) toast(t('sold_out_toast', { item: nameOf(c) })); return; }
  var chosen = sheet.slots[slotId] || [], at = chosen.indexOf(itemId);
  if (at >= 0) {
    if (slot.max_select === 1 && slot.min_select >= 1) return;
    chosen.splice(at, 1); delete sheet.child[childKey(slotId, itemId)];
  } else if (slot.max_select === 1) {
    chosen.forEach(function (old) { delete sheet.child[childKey(slotId, old)]; });
    chosen = [itemId];
  } else if (chosen.length >= slot.max_select) {
    toast(t('max_reached', { n: slot.max_select, group: nameOf(slot) })); return;
  } else chosen.push(itemId);
  sheet.slots[slotId] = chosen; renderSheet();
}

function modsOf(groups, picks) {
  var out = [], labels = [];
  (groups || []).forEach(function (g) {
    var p = picks[g.id] || {};
    g.options.forEach(function (o) {
      if (!p[o.id]) return;
      out.push({ option_id: o.id, quantity: p[o.id] });
      labels.push({ kind: o.kind, name: o.name, name_ar: o.name_ar, name_fr: o.name_fr, q: p[o.id] });
    });
  });
  return { input: out, labels: labels };
}
function confirmSheet() {
  if (!sheet || !sheet.data || firstUnmet()) return;
  var item = sheet.item, main = modsOf(sheet.data.groups, sheet.picks), children = null, picks = [];
  if (sheet.data.combo) {
    children = [];
    sheet.data.combo.slots.forEach(function (slot) {
      (sheet.slots[slot.id] || []).forEach(function (itemId) {
        var c = findChoice(slot, itemId), groups = (sheet.data.child_groups || {})[itemId], child = { slot_id: slot.id, menu_item_id: itemId };
        var mods = groups ? modsOf(groups, picksFor(childKey(slot.id, itemId))) : { input: [], labels: [] };
        if (groups) child.modifiers = mods.input;
        children.push(child);
        picks.push({ name: c.name, name_ar: c.name_ar, name_fr: c.name_fr, mods: mods.labels });
      });
    });
  }
  var line = {
    id: item.id, qty: sheet.qty, unit: sheetUnit(),
    modifiers: (sheet.data.groups && sheet.data.groups.length) ? main.input : undefined,
    children: children || undefined,
    labels: { mods: main.labels, picks: picks },
    config: { picks: copy(sheet.picks), slots: copy(sheet.slots), child: copy(sheet.child) }
  };
  var edit = sheet.edit;
  closeSheet();
  putLine(line, edit);
}

function sheetAction(act, el) {
  if (!sheet && act !== 'closeSheet') return false;
  switch (act) {
    case 'closeSheet': closeSheet(); return true;
    case 'opt': toggleOpt(el.getAttribute('data-scope'), Number(el.getAttribute('data-g')), Number(el.getAttribute('data-o'))); return true;
    case 'optq': {
      var o = el.parentNode.parentNode;
      optQty(o.getAttribute('data-scope'), Number(o.getAttribute('data-g')), Number(o.getAttribute('data-o')), Number(el.getAttribute('data-d')));
      return true;
    }
    case 'pick': togglePick(Number(el.getAttribute('data-s')), Number(el.getAttribute('data-i'))); return true;
    case 'sqty': sheet.qty = Math.max(1, Math.min(99, sheet.qty + Number(el.getAttribute('data-d')))); renderSheet(); return true;
    case 'confirm': confirmSheet(); return true;
    default: return false;
  }
}
`

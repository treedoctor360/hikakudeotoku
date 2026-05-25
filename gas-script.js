// ══════════════════════════════════════════
// 単価チェッカー v3.1 - GASスクリプト
// グループキーワード＋論理削除対応版
// ══════════════════════════════════════════
// 【更新方法】
// 「デプロイを管理」→ 鉛筆アイコン →「バージョン：新しいバージョン」
// →「デプロイ」でURLを変えずに更新できます
// ══════════════════════════════════════════

const SHEET_NAME       = '単価履歴';
const STORE_SHEET_NAME = '店舗マスタ';

// 単価履歴のヘッダー
const HEADERS = [
  'gasId',           // A: 一意ID
  'date',            // B: 日付
  'categoryName',    // C: カテゴリ名
  'categoryIcon',    // D: アイコン
  'productName',     // E: 商品名
  'storeName',       // F: 店舗名
  'label',           // G: 計算概要
  'unitPrice',       // H: 単価（割引前）
  'unitAfter',       // I: 単価（割引後）
  'unitLabel',       // J: 単価の単位
  'basePrice',       // K: 合計値段
  'discountedPrice', // L: 割引後値段
  'memo',            // M: メモ
  'categoryId',      // N: カテゴリID
  'date_iso',        // O: 保存日時
  'groupKey',        // P: グループキーワード
  'deleted',         // Q: 論理削除フラグ（true=削除済み）★新規追加
];

// ══════════════════════════════════════════
// GETハンドラ（すべてGET、CORS回避）
//
// ?action=ping                          → 接続テスト
// ?action=getAll&key=キーワード         → 履歴取得（削除済み除外・キーワード絞り込み）
// ?action=append&data=...&key=...       → 履歴1件追加
// ?action=deleteRecord&gasId=...&key=.. → 論理削除（deletedフラグをtrueに）
// ?action=getStores&key=キーワード      → 店舗マスタ取得
// ?action=addStore&name=...&key=...     → 店舗を1件追加
// ══════════════════════════════════════════
function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput('デプロイURLから呼び出してください')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  const action = e.parameter.action || '';
  const key    = (e.parameter.key || '').trim();

  if (action === 'ping') {
    return jsonResponse({ result: 'pong' });
  }

  // ── 履歴 ──
  if (action === 'getAll') {
    return jsonResponse({ records: getAllRecords(key) });
  }

  if (action === 'append') {
    try {
      const rec    = JSON.parse(e.parameter.data);
      rec.groupKey = key;
      rec.deleted  = false; // 新規追加時は必ずfalse
      const gasId  = appendRecord(rec);
      return jsonResponse({ success: true, gasId });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }

  // 論理削除：該当gasIdの行のdeleted列をtrueに書き換える
  if (action === 'deleteRecord') {
    try {
      const gasId = e.parameter.gasId || '';
      if (!gasId) throw new Error('gasIdが指定されていません');
      const result = markDeleted(gasId, key);
      return jsonResponse({ success: result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }

  // ── 店舗マスタ ──
  if (action === 'getStores') {
    return jsonResponse({ stores: getStores(key) });
  }

  if (action === 'addStore') {
    try {
      const name = e.parameter.name || '';
      if (!name) throw new Error('店舗名が空です');
      addStore(name, key);
      return jsonResponse({ success: true });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }

  return jsonResponse({ error: '不明なアクション: ' + action });
}

// ══════════════════════════════════════════
// 履歴シート操作
// ══════════════════════════════════════════
function getHistSheet() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setBackground('#1a1a1a').setFontColor('#fff').setFontWeight('bold');
  } else {
    // 既存シートに列が足りない場合は追加（マイグレーション）
    const lastCol = sheet.getLastColumn();
    if (lastCol < HEADERS.length) {
      for (let i = lastCol + 1; i <= HEADERS.length; i++) {
        sheet.getRange(1, i).setValue(HEADERS[i - 1]);
      }
    }
  }
  return sheet;
}

function appendRecord(rec) {
  const sheet = getHistSheet();
  const gasId = 'gas_' + new Date().getTime() + '_' + Math.random().toString(36).slice(2,7);
  const row   = HEADERS.map(key => {
    if (key === 'gasId')    return gasId;
    if (key === 'date_iso') return new Date().toISOString();
    if (key === 'deleted')  return false; // 新規は必ずfalse
    const val = rec[key];
    return (val !== null && val !== undefined) ? val : '';
  });
  sheet.appendRow(row);
  return gasId;
}

// deleted=trueの行を除外して返す
function getAllRecords(key) {
  const sheet = getHistSheet();
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];

  return data.slice(1).map(row => {
    const rec = {};
    headers.forEach((h, j) => {
      let val = row[j];
      if (['unitPrice','unitAfter','basePrice','discountedPrice'].includes(h)) {
        val = (val===''||val===null) ? null : Number(val);
      }
      rec[h] = val;
    });
    return rec;
  }).filter(r => {
    if (!r.gasId || r.gasId === 'gasId') return false;
    // スプレッドシートではTRUE（boolean）またはTRUE/true（文字列）で保存される
    if (r.deleted === true || String(r.deleted).toLowerCase() === 'true') return false;
    if (!key) return true;
    return String(r.groupKey || '').trim() === key;
  });
}

// 論理削除：gasIdに一致する行のdeleted列をtrueに書き換える
function markDeleted(gasId, key) {
  const sheet   = getHistSheet();
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const gasIdIdx  = headers.indexOf('gasId');
  const deletedIdx = headers.indexOf('deleted');
  const groupKeyIdx = headers.indexOf('groupKey');

  if (gasIdIdx < 0 || deletedIdx < 0) return false;

  for (let i = 1; i < data.length; i++) {
    const rowGasId   = String(data[i][gasIdIdx] || '').trim();
    const rowGroupKey = String(data[i][groupKeyIdx] || '').trim();

    if (rowGasId !== gasId) continue;
    // キーワードが設定されている場合は一致確認（他グループのデータを消せないようにする）
    if (key && rowGroupKey !== key) continue;

    // deleted列をtrueに更新（行番号は1始まり+ヘッダー行分で+2）
    sheet.getRange(i + 1, deletedIdx + 1).setValue(true);
    return true;
  }
  return false; // 該当行なし
}

// ══════════════════════════════════════════
// 店舗マスタシート操作
// ══════════════════════════════════════════
function getStoreSheet() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(STORE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STORE_SHEET_NAME);
    // ヘッダー: storeName / groupKey / addedAt
    sheet.getRange(1, 1, 1, 3).setValues([['storeName', 'groupKey', 'addedAt']]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 3)
      .setBackground('#2c7a4b').setFontColor('#fff').setFontWeight('bold');
  } else {
    // 既存シートにgroupKey列が無い場合は追加（v2→v3マイグレーション）
    const lastCol = sheet.getLastColumn();
    if (lastCol < 3) {
      sheet.getRange(1, 2).setValue('groupKey');
      sheet.getRange(1, 3).setValue('addedAt');
    }
  }
  return sheet;
}

// keyが空なら全件、keyがあればそのキーワードの店舗だけ返す
function getStores(key) {
  const sheet = getStoreSheet();
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  return data.slice(1)
    .filter(row => {
      const name     = String(row[0] || '').trim();
      const rowKey   = String(row[1] || '').trim();
      if (!name || name === 'storeName') return false;
      if (!key) return true;        // キーワード未設定なら全件
      return rowKey === key;        // キーワード一致のみ
    })
    .map(row => String(row[0]).trim());
}

// 店舗を1件追加（同じキーワード内での重複は無視）
function addStore(name, key) {
  const existing = getStores(key);
  if (existing.includes(name)) return; // 重複スキップ
  const sheet = getStoreSheet();
  sheet.appendRow([name, key || '', new Date().toISOString()]);
}

// ══════════════════════════════════════════
// レスポンスヘルパー
// ══════════════════════════════════════════
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

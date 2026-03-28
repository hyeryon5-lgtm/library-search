const LOAN_CODE_MAP = {
  OK:                 { text: '대출가능', available: true },
  BROKEN:             { text: '대출불가(파손)', available: false },
  OTHER_LOAN:         { text: '대출불가(타관대출중)', available: false },
  OTHER_RETURN:       { text: '대출불가(타관반납중)', available: false },
  RESERVE_LOAN_READY: { text: '대출불가(예약대출 대기중)', available: false },
  NOT_ALLOWED:        { text: '대출불가', available: false },
  OUT_ON_LOAN:        { text: '대출불가(대출중)', available: false },
};

// 괄호 안 저자명 등 제거 → 핵심 제목만 추출
function cleanTitle(title) {
  return title
    .replace(/\s*\([^)]*\)\s*/g, ' ')  // (저자명) 제거
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')  // [부가정보] 제거
    .trim()
    .replace(/\s+/g, ' ')               // 중복 공백 정리
    || title;
}

// ── 성산도서관 ──────────────────────────────────────────
async function searchSungsan(title) {
  const params = new URLSearchParams({
    search_title: title,
    manage_code: 'MB',
    pageno: '1',
    display: '5',
    search_type: 'detail',
    lib_code: 'ss',
  });

  const res = await fetch(`https://lib.changwon.go.kr/book/data.php?${params}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Referer': 'https://lib.changwon.go.kr/book/search.php?lib_code=ss',
      'Origin': 'https://lib.changwon.go.kr',
    },
  });

  const data = await res.json();
  if (data?.apiResponse?.status !== '200' || !data.result) return [];

  return data.result
    .filter(b => b.TITLE_INFO)
    .map(b => {
      const loan = LOAN_CODE_MAP[b.LOAN_CODE] || { text: b.LOAN_CODE || '확인불가', available: false };
      return {
        title: b.TITLE_INFO,
        callNo: b.CALL_NO || '',
        shelfLoc: b.SHELF_LOC_NAME || '',
        available: loan.available,
        stateText: loan.text,
      };
    });
}

// ── 창원/김해/마산 (cwlib.gne.go.kr) ──────────────────
const CWLIB_LIB_CODES = {
  'ghjh0000': '김해지혜의바다',
  'ms000000':  '마산지혜의바다',
  'cn000000':  '창원도서관',
};

async function searchCwlib(title) {
  const url = `https://cwlib.gne.go.kr/book/search.es?mid=a20301010000&searchKeyword=${encodeURIComponent(title)}&searchType=TITLE`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Referer': 'https://cwlib.gne.go.kr/',
    },
  });

  const html = await res.text();

  // bookId → libCode 매핑 (우리가 원하는 도서관만)
  const bookLibMap = {};
  const detailRe = /book_detail\('(\d+)','([a-z0-9]+)'\)/g;
  let m;
  while ((m = detailRe.exec(html)) !== null) {
    const [, id, code] = m;
    if (CWLIB_LIB_CODES[code]) bookLibMap[id] = code;
  }

  // 제목 파싱
  const titles = {};
  const titleRe = /id="title_(\d+)">([^<]+)<\/a>/g;
  while ((m = titleRe.exec(html)) !== null) titles[m[1]] = m[2].trim();

  // 청구기호 파싱 (place_ID></span> 바로 뒤 텍스트)
  const callNos = {};
  const callRe = /id="place_(\d+)"><\/span>([^&\n<]+)/g;
  while ((m = callRe.exec(html)) !== null) callNos[m[1]] = m[2].trim();

  // 대출상태 파싱 (HTML 주석)
  const loans = {};
  const loanRe = /id="loan_(\d+)"><!--([^-]*)-->/g;
  while ((m = loanRe.exec(html)) !== null) loans[m[1]] = m[2].trim();

  // 도서관별 결과 정리
  const results = {};
  Object.values(CWLIB_LIB_CODES).forEach(name => (results[name] = []));

  for (const [id, code] of Object.entries(bookLibMap)) {
    const libName = CWLIB_LIB_CODES[code];
    const loanStatus = loans[id] || '';
    const available = loanStatus === '대출가능';

    results[libName].push({
      title: titles[id] || '',
      callNo: callNos[id] || '',
      available,
      stateText: loanStatus || '확인불가',
    });
  }

  return results;
}

// ── 핸들러 ───────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { title } = req.query;
  if (!title?.trim()) return res.status(400).json({ error: '제목을 입력해주세요' });

  const cleaned = cleanTitle(title.trim());

  try {
    const [sungsanResults, cwlibResults] = await Promise.all([
      searchSungsan(cleaned).catch(() => []),
      searchCwlib(cleaned).catch(() => ({})),
    ]);

    return res.json({
      searchedTitle: cleaned,
      libraries: {
        '성산도서관': sungsanResults,
        ...cwlibResults,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
  }
};

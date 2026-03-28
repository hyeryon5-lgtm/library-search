const LOAN_CODE_MAP = {
  OK:                  { text: '대출가능(비치중)', available: true },
  BROKEN:              { text: '대출불가(파손자료)', available: false },
  OTHER_LOAN:          { text: '대출불가(타관대출중)', available: false },
  OTHER_RETURN:        { text: '대출불가(타관반납중)', available: false },
  RESERVE_LOAN_READY:  { text: '대출불가(예약대출 대기중)', available: false },
  NOT_ALLOWED:         { text: '대출불가', available: false },
  OUT_ON_LOAN:         { text: '대출불가(대출중)', available: false },
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { title } = req.query;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: '제목을 입력해주세요' });
  }

  try {
    const params = new URLSearchParams({
      search_title: title.trim(),
      manage_code: 'MB',
      pageno: '1',
      display: '5',
      search_type: 'detail',
      lib_code: 'ss',
    });

    const response = await fetch(
      `https://lib.changwon.go.kr/book/data.php?${params}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          'Referer': 'https://lib.changwon.go.kr/book/search.php?lib_code=ss',
          'Origin': 'https://lib.changwon.go.kr',
        },
      }
    );

    const data = await response.json();

    if (data?.apiResponse?.status !== '200' || !data.result) {
      return res.json({ results: [], total: 0 });
    }

    // result[0]은 SEARCH_COUNT/FACET_GROUP, 나머지가 책 데이터
    const books = data.result.filter(item => item.TITLE_INFO);

    const results = books.map(b => {
      const loan = LOAN_CODE_MAP[b.LOAN_CODE] || { text: b.LOAN_CODE || '알수없음', available: false };
      return {
        title: b.TITLE_INFO,
        author: b.AUTHOR || '',
        callNo: b.CALL_NO || '',
        shelfLoc: b.SHELF_LOC_NAME || '',
        available: loan.available,
        stateText: loan.text,
      };
    });

    return res.json({ results, total: results.length });

  } catch (error) {
    return res.status(500).json({ error: '도서관 서버 연결 중 오류가 발생했습니다.' });
  }
};

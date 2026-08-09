這是「原始題庫真正恢復版」。
重點：
1. 保留原本完整 QUESTIONS_DATA，不重建、不刪題。
2. 修正考題中心切換後題庫資料存取範圍錯誤：getQuestionsDataSafe 改為全域函式。
3. 修正申論拆解與全真模考因找不到題庫資料而空白的問題。
4. 加入頁面啟動保險，確認題庫載入後自動渲染。
5. GitHub 結構必須是：
   index.html
   sw.js
   data/questions.js
   data/flashcards.js
   data/crash35_data.js

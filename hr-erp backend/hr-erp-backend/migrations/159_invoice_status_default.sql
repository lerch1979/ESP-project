-- 159: a számla fizetési állapotának alapértéke 'pending' helyett 'draft'.
--
-- A PROBLÉMA
-- ----------
-- Az oszlop alapértéke 'pending' volt, viszont a szerver állapotgépe (VALID_STATUSES /
-- VALID_TRANSITIONS az invoice.controller-ben) ezt az értéket NEM ismeri. Ami 'pending'
-- állapotba kerül, az ott is marad: a módosítás minden továbblépést visszautasít, mert
-- VALID_TRANSITIONS['pending'] üres — se fizetettre, se sztornóra nem állítható.
--
-- Az alkalmazás ma minden beszúrásnál explicit állapotot ad, tehát az alapérték csak akkor
-- lépne életbe, ha valaki kézzel (vagy egy későbbi kódúton) állapot nélkül szúrna be sort.
-- Ez pontosan az a fajta csendes csapda, amit nem érdemes bent hagyni.
--
-- A meglévő 'pending' sorokat 'sent'-re visszük át: a felületen ez a címke "Függőben"
-- volt, jelentése "kiállítva, még nincs kifizetve" — ennek a 'sent' felel meg, nem a
-- 'draft'. Így a fizetettre állítás útja nyitva marad rajtuk.

ALTER TABLE invoices ALTER COLUMN payment_status SET DEFAULT 'draft';

UPDATE invoices
   SET payment_status = 'sent'
 WHERE payment_status = 'pending';

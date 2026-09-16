-- 161: "ezt a kettőt SOHA ne vond össze" — szándékosan különálló partnerek.
--
-- A PROBLÉMA
-- ----------
-- A beszállító-duplikátum kereső ékezet- és kisbetű-függetlenül csoportosítja a neveket,
-- hogy a RÁBA/Rába típusú írásmód-ütközések előkerüljenek. Vannak viszont partnerek,
-- akiknek a neve hasonlít, mégis KÜLÖN jogi entitások — az összevonásuk nem elírás
-- javítása lenne, hanem két cég pénzügyeinek összekeverése:
--
--   Barcza Gyula      — a Sarród I. szállásadója
--   Barcza Bea        — a Sarród II. szállásadója
--   Barcza Gyuláné    — a Sarród I. KAPCSOLATTARTÓJA, nem önálló partner
--   Sözen Diána és Barczáné Locsmándi Beáta tulajdonostársak közössége
--                     — önálló jogi entitás, a Beled szállásadója
--
-- A kereső ma nem is hozná őket egy csoportba (a normalizált nevük különbözik), de a
-- döntés így is rögzítendő: ha valaha lazább illesztés kerül bele, ez a tábla akkor is
-- megállítja az összevonást. A tudás ne egy beszélgetésben maradjon.

BEGIN;

CREATE TABLE IF NOT EXISTS vendor_keep_separate (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_key_a  varchar(200) NOT NULL,
  name_key_b  varchar(200) NOT NULL,
  reason      text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  -- A pár rendezetten tárolódik (a < b), így egy párt nem lehet kétszer felvenni
  -- fordított sorrendben.
  CONSTRAINT vks_ordered CHECK (name_key_a < name_key_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_vendor_keep_separate
  ON vendor_keep_separate(name_key_a, name_key_b);

COMMENT ON TABLE vendor_keep_separate IS
  'Szándékosan különálló partnerpárok. A /vendors/merge visszautasítja az itt szereplő párokat, a duplikátum-lista pedig megjelöli őket — nem rejti el, hogy látszódjon: a rendszer tud róluk.';

-- A négy entitás páronként. A kulcs a utils/nameMatch nameKey() alakja: ékezet nélkül,
-- kisbetűsen, írásjelek szóközre cserélve, többes szóköz összevonva.
INSERT INTO vendor_keep_separate (name_key_a, name_key_b, reason)
SELECT least(a, b), greatest(a, b), r FROM (VALUES
  ('barcza gyula', 'barcza gyulane',
   'Barcza Gyula a Sarród I. szállásadója; Barcza Gyuláné ugyanott KAPCSOLATTARTÓ, nem önálló partner'),
  ('barcza gyula', 'barcza bea',
   'Két külön szállásadó: Sarród I. és Sarród II.'),
  ('barcza bea', 'barcza gyulane',
   'Barcza Bea a Sarród II. szállásadója; Barcza Gyuláné a Sarród I. kapcsolattartója'),
  ('barcza gyula', 'sozen diana timea es barczane locsmandi beata tulajdonostarsak kozossege',
   'A tulajdonostársak közössége önálló jogi entitás, a Beled szállásadója'),
  ('barcza bea', 'sozen diana timea es barczane locsmandi beata tulajdonostarsak kozossege',
   'A tulajdonostársak közössége önálló jogi entitás, a Beled szállásadója'),
  ('barcza gyulane', 'sozen diana timea es barczane locsmandi beata tulajdonostarsak kozossege',
   'A közösség egyik tagja Barczáné Locsmándi Beáta, de a közösség NEM azonos vele')
) AS v(a, b, r)
WHERE NOT EXISTS (
  SELECT 1 FROM vendor_keep_separate k
   WHERE k.name_key_a = least(v.a, v.b) AND k.name_key_b = greatest(v.a, v.b));

-- ── Barcza Gyuláné a Sarród I. kapcsolattartója ─────────────────────────
-- Így a neve ott van, ahol keresni fogják, és nem lesz belőle önálló partner azért,
-- mert valakinek kell egy hely, ahova felírja.
INSERT INTO partner_contacts (accommodation_id, contractor_id, name, role_title, language, is_primary, is_active, notes)
SELECT a.id, a.current_contractor_id, 'Barcza Gyuláné', 'Kapcsolattartó', 'hu', true, true,
       'A Sarród I. kapcsolattartója. NEM önálló partner és nem azonos Barcza Gyulával (a szállásadóval) — lásd vendor_keep_separate.'
  FROM accommodations a
 WHERE a.name = 'Sarród I.'
   AND NOT EXISTS (SELECT 1 FROM partner_contacts pc
                    WHERE pc.accommodation_id = a.id AND pc.name = 'Barcza Gyuláné');

COMMIT;

const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, LevelFormat } = require('docx');
const fs = require('fs');

const doc = new Document({
  styles: {
    default: { 
      document: { 
        run: { font: "Arial", size: 24 } 
      } 
    },
    paragraphStyles: [
      { 
        id: "Heading1", 
        name: "Heading 1", 
        basedOn: "Normal", 
        next: "Normal", 
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "2E5C8A" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } 
      },
      { 
        id: "Heading2", 
        name: "Heading 2", 
        basedOn: "Normal", 
        next: "Normal", 
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "4472C4" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 } 
      },
      { 
        id: "Heading3", 
        name: "Heading 3", 
        basedOn: "Normal", 
        next: "Normal", 
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "5B9BD5" },
        paragraph: { spacing: { before: 140, after: 80 }, outlineLevel: 2 } 
      }
    ]
  },
  numbering: {
    config: [
      { 
        reference: "bullets",
        levels: [
          { 
            level: 0, 
            format: LevelFormat.BULLET, 
            text: "•", 
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } 
          }
        ] 
      },
      { 
        reference: "numbers",
        levels: [
          { 
            level: 0, 
            format: LevelFormat.DECIMAL, 
            text: "%1.", 
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } 
          }
        ] 
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: {
          width: 11906,   // A4
          height: 16838
        },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      // Cím
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "INTEGRÁLT HR-ERP RENDSZER", bold: true, size: 36 })
        ],
        spacing: { after: 200 }
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Projekt Terv és Technikai Dokumentáció", size: 28, color: "666666" })
        ],
        spacing: { after: 400 }
      }),

      // 1. Projekt áttekintés
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("1. PROJEKT ÁTTEKINTÉS")]
      }),
      
      new Paragraph({
        children: [
          new TextRun("A rendszer egy komplex, többcéges (multi-tenant) HR-ERP platform, amely mobilalkalmazáson és webes admin felületen keresztül szolgálja ki a felhasználókat. A rendszer célja a munkavállalók, bérlők és külső partnerek hatékony kezelése, ticketing alapú ügyintézés, valamint átfogó kommunikációs és pénzügyi funkciók biztosítása.")
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("1.1 Célok")]
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Skálázható rendszer akár 3000 felhasználó kiszolgálására")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Multi-tenant architektúra (2-3 kezdő megbízó, bővíthető)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("iOS és Android platformok támogatása")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Többnyelvű felület (magyar, angol, német - bővíthető)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("GDPR-kompatibilis adatkezelés")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Teljes audit trail minden művelethez")]
      }),

      // 2. Technológiai stack
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("2. TECHNOLÓGIAI VÁLASZTÁSOK")],
        spacing: { before: 400 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("2.1 Mobilalkalmazás")]
      }),

      new Paragraph({
        children: [new TextRun({ text: "Platform: ", bold: true }), new TextRun("React Native")]
      }),
      new Paragraph({
        children: [
          new TextRun("Indoklás: Egy kódbázis iOS-re és Androidra. Gyors fejlesztés, jó teljesítmény, nagy fejlesztői közösség.")
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("2.2 Webes Admin Felület")]
      }),

      new Paragraph({
        children: [new TextRun({ text: "Frontend: ", bold: true }), new TextRun("React + TypeScript")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "UI Framework: ", bold: true }), new TextRun("Material-UI (MUI)")]
      }),
      new Paragraph({
        children: [
          new TextRun("Indoklás: Modern, gyors, komponens alapú fejlesztés. TypeScript a típusbiztonságért.")
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("2.3 Backend (Szerver)")]
      }),

      new Paragraph({
        children: [new TextRun({ text: "Platform: ", bold: true }), new TextRun("Node.js 20 LTS")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Framework: ", bold: true }), new TextRun("Express.js")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "API: ", bold: true }), new TextRun("RESTful API + WebSocket (valós idejű értesítésekhez)")]
      }),
      new Paragraph({
        children: [
          new TextRun("Indoklás: Gyors, skálázható, JavaScript/TypeScript használata mindenhol (full-stack).")
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("2.4 Adatbázis")]
      }),

      new Paragraph({
        children: [new TextRun({ text: "Fő adatbázis: ", bold: true }), new TextRun("PostgreSQL 16")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Cache: ", bold: true }), new TextRun("Redis (gyors lekérdezésekhez)")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Fájltárolás: ", bold: true }), new TextRun("AWS S3")]
      }),
      new Paragraph({
        children: [
          new TextRun("Indoklás: PostgreSQL stabil, ACID kompatibilis, jól skálázható. Redis a teljesítmény optimalizáláshoz.")
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("2.5 Infrastruktúra")]
      }),

      new Paragraph({
        children: [new TextRun({ text: "Cloud Provider: ", bold: true }), new TextRun("AWS (Amazon Web Services)")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Szerverek: ", bold: true }), new TextRun("AWS EC2 (Auto Scaling)")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Adatbázis: ", bold: true }), new TextRun("AWS RDS PostgreSQL")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Fájlok: ", bold: true }), new TextRun("AWS S3")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Push értesítések: ", bold: true }), new TextRun("Firebase Cloud Messaging (FCM)")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Email: ", bold: true }), new TextRun("AWS SES vagy SendGrid")]
      }),

      // 3. Szerepkörök
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("3. FELHASZNÁLÓI SZEREPKÖRÖK")],
        spacing: { before: 400 }
      }),

      // Táblázat létrehozása
      createRoleTable(),

      // 4. Adatbázis struktúra
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("4. ADATBÁZIS STRUKTÚRA (FŐBB TÁBLÁK)")],
        spacing: { before: 400 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("4.1 Felhasználók és jogosultságok")]
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "tenants", bold: true }), new TextRun(" - Megbízó cégek (multi-tenant)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "users", bold: true }), new TextRun(" - Összes felhasználó")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "roles", bold: true }), new TextRun(" - Szerepkörök")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "user_roles", bold: true }), new TextRun(" - Felhasználó-szerepkör kapcsolat")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "permissions", bold: true }), new TextRun(" - Jogosultságok")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("4.2 HR modul")],
        spacing: { before: 200 }
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "employees", bold: true }), new TextRun(" - Munkavállalók törzsadatai")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "employee_statuses", bold: true }), new TextRun(" - Státuszok (aktív, szabadság, stb.)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "documents", bold: true }), new TextRun(" - Dokumentumok (szerződések, igazolások)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "organizational_units", bold: true }), new TextRun(" - Szervezeti egységek")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("4.3 Ticketing rendszer")],
        spacing: { before: 200 }
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "tickets", bold: true }), new TextRun(" - Hibajegyek/bejelentések")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "ticket_categories", bold: true }), new TextRun(" - Kategóriák (HR, technikai, pénzügyi)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "ticket_statuses", bold: true }), new TextRun(" - Státuszok")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "ticket_comments", bold: true }), new TextRun(" - Megjegyzések, üzenetek")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "ticket_attachments", bold: true }), new TextRun(" - Csatolt fájlok")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "ticket_history", bold: true }), new TextRun(" - Audit log (minden módosítás)")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("4.4 Kommunikáció")],
        spacing: { before: 200 }
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "notifications", bold: true }), new TextRun(" - Értesítések (push, email)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "messages", bold: true }), new TextRun(" - Rendszerüzenetek")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "notification_templates", bold: true }), new TextRun(" - Üzenet sablonok")]
      }),

      // 5. Státuszok
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("5. TICKET STÁTUSZOK")],
        spacing: { before: 400 }
      }),

      createStatusTable(),

      // 6. Fejlesztési ütemterv
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("6. FEJLESZTÉSI ÜTEMTERV (6 HÉT)")],
        spacing: { before: 400 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("6.1 1-2. hét: Alapinfrastruktúra")]
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("AWS környezet felállítása")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("PostgreSQL adatbázis beállítása")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Backend API alapok (authentikáció, JWT tokenek)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Multi-tenant adatbázis struktúra")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Szerepkör-alapú jogosultságkezelés (RBAC)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Mobil app alapstruktúra (React Native)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Admin webes felület alapok (React)")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun("Demo eredmény (2. hét vége):")]
      }),
      new Paragraph({
        children: [
          new TextRun("Működő bejelentkezés mobilon és weben, szerepkörök elkülönülése (szuperadmin, admin, felhasználó látható)")
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("6.2 3-4. hét: Ticketing rendszer")]
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Ticket létrehozása (mobilból és admin felületről)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Kategóriák kezelése (HR, technikai, pénzügyi, általános)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Státuszok (új, folyamatban, anyagra várunk, számlázás, lezárva, stb.)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Felelős hozzárendelése (belső, külső alvállalkozó)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Megjegyzések/üzenetek a jegyen belül")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Fájl feltöltés (fotó, PDF)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Ticket lista szűrése (státusz, kategória, dátum)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Külső alvállalkozó: csak saját ticketek láthatóak")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun("Demo eredmény (4. hét vége):")]
      }),
      new Paragraph({
        children: [
          new TextRun("Teljes ticketing működik: létrehozás, státuszváltás, megjegyzések, fájlcsatolás. Külső alvállalkozók csak saját feladataikat látják.")
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("6.3 5. hét: Értesítések és kommunikáció")]
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Push értesítések (Firebase FCM integráció)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Email értesítések (AWS SES vagy SendGrid)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Automatikus értesítés státuszváltáskor")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Értesítési beállítások (felhasználónként ki-be kapcsolható)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Üzenet sablonok (többnyelvű)")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun("Demo eredmény (5. hét vége):")]
      }),
      new Paragraph({
        children: [
          new TextRun("Valós idejű értesítések mobilon (push) és emailben. Automatikus értesítések minden státuszváltásnál.")
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("6.4 6. hét: HR modul alapok és finomhangolás")]
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Munkavállalói törzsadatok (CRUD műveletek)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Státuszok kezelése (aktív, szabadság, kilépett, stb.)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Szervezeti egységekhez rendelés")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Dokumentumok feltöltése (szerződések)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Teljes rendszer tesztelése")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Biztonsági audit")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Teljesítmény optimalizálás")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun("Demo eredmény (6. hét vége):")]
      }),
      new Paragraph({
        children: [
          new TextRun("Teljes működő prototípus: bejelentkezés, HR alapok, ticketing, értesítések. Készen áll tesztelésre 2-3 megbízó céggel.")
        ],
        spacing: { after: 200 }
      }),

      // 7. Költségbecslés
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("7. KÖLTSÉGBECSLÉS")],
        spacing: { before: 400 }
      }),

      createCostTable(),

      new Paragraph({
        children: [
          new TextRun({ text: "Megjegyzés: ", bold: true }),
          new TextRun("A költségek fokozatosan növekednek a felhasználószám növekedésével. Kezdetben (tesztelés) alacsonyabb, teljes üzemben (3000 felhasználó) magasabb.")
        ],
        spacing: { before: 200, after: 200 }
      }),

      // 8. Tesztelés
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("8. TESZTELÉSI STRATÉGIA")],
        spacing: { before: 400 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("8.1 Tesztelési típusok")]
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Unit teszt: ", bold: true }), new TextRun("Egyedi funkciók tesztelése")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Integrációs teszt: ", bold: true }), new TextRun("Modulok közötti kommunikáció")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "E2E teszt: ", bold: true }), new TextRun("Teljes folyamatok (pl. jegy létrehozása a lezárásig)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Biztonsági teszt: ", bold: true }), new TextRun("Jogosultságok, authentikáció")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Terhelés teszt: ", bold: true }), new TextRun("3000 felhasználó szimulálása")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "UAT (User Acceptance Test): ", bold: true }), new TextRun("Végfelhasználói tesztelés")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("8.2 Tesztelési ütemterv")],
        spacing: { before: 200 }
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Minden sprint végén: Demo + alapvető tesztelés")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("6. hét vége: Átfogó tesztelés minden modullal")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("7. hét: UAT (felhasználói tesztelés valós adatokkal)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("8. hét: Javítások, finomhangolás")]
      }),

      // 9. Biztonság
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("9. BIZTONSÁGI INTÉZKEDÉSEK")],
        spacing: { before: 400 }
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "HTTPS titkosítás", bold: true }), new TextRun(" minden kommunikációban")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "JWT token", bold: true }), new TextRun(" alapú authentikáció (15 perces lejárat, refresh token)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Jelszó hashelés", bold: true }), new TextRun(" (bcrypt, 12 rounds)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Role-based Access Control (RBAC)", bold: true }), new TextRun(" - minden művelet jogosultság-ellenőrzéssel")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Multi-tenant izoláció", bold: true }), new TextRun(" - tenant_id minden lekérdezésben")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "SQL injection védelem", bold: true }), new TextRun(" (paraméteres lekérdezések)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Rate limiting", bold: true }), new TextRun(" (API hívások korlátozása)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Audit log", bold: true }), new TextRun(" minden módosításhoz (ki, mit, mikor)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "GDPR compliance", bold: true }), new TextRun(" - adattörlés, exportálás, hozzájárulás kezelés")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Napi backup", bold: true }), new TextRun(" (adatbázis + fájlok)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text: "Automatikus kijelentkezés", bold: true }), new TextRun(" 30 perc inaktivitás után")]
      }),

      // 10. Következő fázisok
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("10. KÖVETKEZŐ FEJLESZTÉSI FÁZISOK (6 HÉT UTÁN)")],
        spacing: { before: 400 }
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Fázis 2 (7-10. hét): Pénzügyi modul")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Számlázás, költségek kezelése")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Pénzügyi riportok")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Exportálás könyvelési rendszerekbe")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Fázis 3 (11-14. hét): Feladatkezelés és workflow")],
        spacing: { before: 200 }
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Feladatok kezelése")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Jóváhagyási folyamatok")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Automatizált workflow-k")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Fázis 4 (15-18. hét): Vezetői dashboard és analitika")],
        spacing: { before: 200 }
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("KPI-k és mutatók")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Trend elemzések")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Testreszabható riportok")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Fázis 5 (19-22. hét): Tanácsadás és oktatás")],
        spacing: { before: 200 }
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Tanácsadási események kezelése")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Oktatási anyagok")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Részvétel nyilvántartás")]
      }),

      // Összefoglalás
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("11. ÖSSZEFOGLALÁS")],
        spacing: { before: 400 }
      }),

      new Paragraph({
        children: [
          new TextRun("A tervezett rendszer egy modern, skálázható, multi-tenant HR-ERP platform, amely mobil és webes felületen keresztül szolgálja ki a felhasználókat. Az első 6 hetes fejlesztési fázis egy működő prototípust eredményez, amely tartalmazza a legfontosabb alapfunkciókat: authentikáció, jogosultságkezelés, ticketing rendszer, értesítések és HR alapok.")
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        children: [
          new TextRun({ text: "Kulcs előnyök:", bold: true })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Egy kódbázis iOS és Android platformokra")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Biztonságos multi-tenant architektúra")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Skálázható infrastruktúra (akár 3000+ felhasználóra)")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("GDPR-kompatibilis adatkezelés")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Iteratív fejlesztés, gyakori demókkal")]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Költséghatékony kezdés, fokozatos bővítés")]
      }),

      new Paragraph({
        children: [
          new TextRun({ text: "\n\nKészítette: ", bold: true }),
          new TextRun("Claude AI"),
          new TextRun({ text: "\nDátum: ", bold: true }),
          new TextRun(new Date().toLocaleDateString('hu-HU')),
        ],
        spacing: { before: 400 }
      })
    ]
  }]
});

// Segédfüggvények táblázatokhoz
function createRoleTable() {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [2000, 7026],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            shading: { fill: "2E5C8A", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 2000, type: WidthType.DXA },
            children: [new Paragraph({ 
              children: [new TextRun({ text: "Szerepkör", bold: true, color: "FFFFFF" })] 
            })]
          }),
          new TableCell({
            borders,
            shading: { fill: "2E5C8A", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 7026, type: WidthType.DXA },
            children: [new Paragraph({ 
              children: [new TextRun({ text: "Jogosultságok", bold: true, color: "FFFFFF" })] 
            })]
          })
        ]
      }),
      createRoleRow("Szuperadmin", "Teljes hozzáférés, cégek kezelése, rendszerbeállítások, minden adat", false),
      createRoleRow("Megbízó (Adatkezelő)", "Saját cég teljes adatai, munkavállalók, pénzügy, riportok. NEM lát más cégeket!", true),
      createRoleRow("Általános Adminisztrátor", "HR műveletek, ticketek kezelése, kommunikáció. Egy megbízó alatt dolgozik.", false),
      createRoleRow("Feladat-felelős", "Ticketek kezelése, státuszok, megjegyzések. Csak saját feladatok.", true),
      createRoleRow("Külső Alvállalkozó", "Csak rájuk kiosztott ticketek, státusz frissítés, megjegyzés, fájl feltöltés. Szigorúan korlátozott.", false),
      createRoleRow("Felhasználó", "Saját adatok, hibajegy beküldése, üzenetek olvasása. Csak saját dolgok.", true)
    ]
  });
}

function createRoleRow(role, permissions, isGray) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  return new TableRow({
    children: [
      new TableCell({
        borders,
        shading: { fill: isGray ? "F2F2F2" : "FFFFFF", type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: 2000, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: role, bold: true })] })]
      }),
      new TableCell({
        borders,
        shading: { fill: isGray ? "F2F2F2" : "FFFFFF", type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: 7026, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun(permissions)] })]
      })
    ]
  });
}

function createStatusTable() {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [3000, 6026],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            shading: { fill: "4472C4", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 3000, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "Státusz", bold: true, color: "FFFFFF" })] })]
          }),
          new TableCell({
            borders,
            shading: { fill: "4472C4", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 6026, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "Leírás", bold: true, color: "FFFFFF" })] })]
          })
        ]
      }),
      createStatusRow("Új (feldolgozásra vár)", "A jegy létrejött, még senki nem kezdte el kezelni", false),
      createStatusRow("Folyamatban", "Aktívan dolgoznak rajta", true),
      createStatusRow("Anyagra várunk", "Munkák szünetelnek, alkatrész vagy anyag beszerzése folyik", false),
      createStatusRow("Számlázás folyamatban", "Munka kész, számlázási folyamat zajlik", true),
      createStatusRow("Pénzügyi teljesítés folyamatban", "Számla kiállítva, fizetésre vár", false),
      createStatusRow("Várakozik", "Egyéb ok miatt szünetel (pl. ügyfél válaszára vár)", true),
      createStatusRow("Továbbítva másik területnek", "Átadva másik osztálynak/felelősnek", false),
      createStatusRow("Sikeresen lezárva", "Munka befejezve, minden rendben", true),
      createStatusRow("Elutasítva", "A kérés nem teljesíthető vagy jogosult elutasította", false),
      createStatusRow("Nem megvalósítható", "Technikai vagy egyéb okok miatt lehetetlen", true)
    ]
  });
}

function createStatusRow(status, description, isGray) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  return new TableRow({
    children: [
      new TableCell({
        borders,
        shading: { fill: isGray ? "F2F2F2" : "FFFFFF", type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: 3000, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: status, bold: true })] })]
      }),
      new TableCell({
        borders,
        shading: { fill: isGray ? "F2F2F2" : "FFFFFF", type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: 6026, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun(description)] })]
      })
    ]
  });
}

function createCostTable() {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [3500, 2500, 3026],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            shading: { fill: "70AD47", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 3500, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "Szolgáltatás", bold: true, color: "FFFFFF" })] })]
          }),
          new TableCell({
            borders,
            shading: { fill: "70AD47", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 2500, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "Kezdeti (EUR/hó)", bold: true, color: "FFFFFF" })] })]
          }),
          new TableCell({
            borders,
            shading: { fill: "70AD47", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 3026, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "3000 felhasználó (EUR/hó)", bold: true, color: "FFFFFF" })] })]
          })
        ]
      }),
      createCostRow("AWS EC2 (szerverek)", "50-80", "300-400", false),
      createCostRow("AWS RDS PostgreSQL", "30-50", "150-200", true),
      createCostRow("AWS S3 (fájltárolás)", "10-20", "50-80", false),
      createCostRow("Redis Cache", "15-25", "50-70", true),
      createCostRow("Push értesítések (FCM)", "0-10", "20-30", false),
      createCostRow("Email szolgáltatás", "10-20", "30-50", true),
      createCostRow("Domain, SSL", "5-10", "10-15", false),
      createCostRow("Backup és monitoring", "20-30", "50-80", true),
      new TableRow({
        children: [
          new TableCell({
            borders,
            shading: { fill: "FFC000", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 3500, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "ÖSSZESEN", bold: true })] })]
          }),
          new TableCell({
            borders,
            shading: { fill: "FFC000", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 2500, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "140-245 EUR", bold: true })] })]
          }),
          new TableCell({
            borders,
            shading: { fill: "FFC000", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 3026, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "660-925 EUR", bold: true })] })]
          })
        ]
      })
    ]
  });
}

function createCostRow(service, initial, full, isGray) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  return new TableRow({
    children: [
      new TableCell({
        borders,
        shading: { fill: isGray ? "F2F2F2" : "FFFFFF", type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: 3500, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun(service)] })]
      }),
      new TableCell({
        borders,
        shading: { fill: isGray ? "F2F2F2" : "FFFFFF", type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: 2500, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun(initial)] })]
      }),
      new TableCell({
        borders,
        shading: { fill: isGray ? "F2F2F2" : "FFFFFF", type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: 3026, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun(full)] })]
      })
    ]
  });
}

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/mnt/user-data/outputs/HR_ERP_Projekt_Terv.docx", buffer);
  console.log("Dokumentum sikeresen létrehozva!");
});

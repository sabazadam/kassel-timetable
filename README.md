# Kassel Timetable (Ders Programı)

**English:** A weekly timetable planner for all Uni Kassel Bachelor, Master and Lehramt programs, built from the eCampus catalogue. Volunteer student project, not an official university service. Live at https://spacedevelopers.net/.

### Quick start

Needs Node.js 20+. The course data is already in the repo (`site/data/`), so no scraping is needed to run it.

```sh
git clone https://github.com/sabazadam/kassel-timetable.git && cd kassel-timetable
npm install
npm run serve   # http://localhost:3000/?p=bsc-informatik
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) to help out.

---

Uni Kassel eCampus kataloğundaki tüm fakültelerin Bachelor, Master ve Lehramt programlarının derslerinden (Wintersemester 2026/27, 185 program) haftalık ders programı oluşturmak için statik bir web uygulaması. Her programın yalnızca en güncel PO'su alınır (ör. Master Elektrotechnik 2023, 2016 değil); program listesi eCampus'tan otomatik bulunur (`scraper/programs.js`). FB 11 gibi bazı fakülteler programı PO yerine başlık olarak listeler; bunların her hesabı (Konto) ayrı açılır. Ana sayfa programları fakülteye göre gruplar ve aranabilir.

Hazır programlar ve Modulhandbuch sırasıyla bölümler yalnızca **Master Informatik (2018)** için var. Gereklilik takibi ("bu alandan N modül", "bu modül") 84 programda var: Master Informatik elle, diğerleri `scraper/rules/<slug>.json` dosyalarından (resmi PO/Modulhandbuch PDF'lerinden çıkarıldı, kaynak linkleri dosyada; metinlerin TR/DE çevirisi `scraper/rules-i18n.json`). Kural dosyası olmayan programlarda ya seçim yok ya da kural "N alandan birini seç" gibi bu biçimle ifade edilemiyor. Diğer programlarda modül listesi eCampus ağacının üst başlıklarına göre gruplanır.

PO ağacının dışında listelenen dersler de alınır: programın "Ergänzungen" başlığı (modülü olmayan dersler en yakın başlığın adıyla modül olur) ve fakültenin "Schlüsselkompetenzen" listeleri (Elektrotechnik / NES, Informatik Bachelor, Informatik Master). Bu listelerdeki dersler programın kendi Schlüsselkompetenzen modülüne veya alt başlığıyla aynı adlı modüle eklenir ve "birini seç" modülü olur. FB 07 derslerinin sayfasında başlık, numara ve tür yok; bunlar katalog satırından alınır.


- Modül ekle/çıkar, haftalık takvimde gör, çakışmalar kırmızı işaretlenir
- İngilizce ders/modül isimleri (eCampus çoğunu Almanca tutuyor; çeviriler `scraper/translations.js`, FB 16 için `translations-fb16.json`, diğer fakülteler için `translations-uni.json` ve `notes-uni.json` içinde; diğer fakültelerinkileri Grok çevirdi ve ikinci bir Grok turu denetledi, Almanca orijinal altta küçük yazılır)
- Master gereklilik takibi: 4 alan (Math/EE, Theoretical, Technical, Practical CS) + zorunlu modüller (Project, Seminar, Key competencies)
- Modül listesi Modulhandbuch sırasıyla bölümlere ayrılır (Practical, Technical, Theoretical, Math/EE, Project, Seminar, ...); modül kodları (PI-10, TeI-14) ve resmi İngilizce isimler moduldatenbank.uni-kassel.de listesinden gelir
- ECTS toplamı ve hedef çubuğu
- Paralel grup seçimi ve tek tek termin (Übung/Tutorium) açıp kapatma
- Arama ve "Hangi günler boş kalsın?" seçimi: o günlere dersi düşen modüller gizlenir, takvimde o günler taralı görünür
- Hazır programlar: her biri bir ilgi alanına (yapay zekâ ve veri, yazılım ve güvenlik, enerji informatiği, gömülü sistemler, insan ve tasarım, teori) ya da hedefe (önce gereklilikler, en boş hafta) göre kurulur. Programlar ECTS hedefine yakın, çakışmasızdır ve seçilen boş günlere uyar (`site/js/themes.js`, `suggestPrograms`). Seçilen modüller korunup kalanı tamamlanabilir; "Başka varyasyon" aynı alandaki diğer seçenekleri gösterir
- Arayüz Türkçe, İngilizce ve Almanca. Dil tarayıcının diline göre seçilir ve sağ üstten değiştirilebilir (`site/js/i18n.js`). Almancada ders adları orijinal, diğer dillerde İngilizce gösterilir
- Üstte tek çubuk: başlık, ECTS, çakışma durumu ve gereklilikler (tamamlanınca dolan işaretler). Modül listesi "Modül listesi / Listeyi gizle" ile açılıp kapanır; kapalıyken takvim sayfanın ortasında tam genişlikte durur
- Takvimin saat yüksekliği pencereye göre ayarlanır, hafta tek ekrana sığar; içeriği sığmayan kutu tıklayınca (dokununca) açılır. Telefonda (700px altı) takvim gün gün listeye dönüşür
- Gelecek dönemler (yalnızca Master Computer Science): modül kitapçığındaki 80 modülün hangi dönemde açıldığı ("annually in summer semester", "Alle 4 Semester ab Sommersemester 2026"). Dönem seçilir (bu dönem ve sonraki 3), alan ve aramayla süzülür, modüller o dönem için "Planla" ile işaretlenir (localStorage `ders-programi:plan:<program>`). Kart açılınca ders türleri, hocalar, ön bilgi, sınav, iş yükü ve içerik görünür; Almanca alanların İngilizce/Türkçe çevirisi Grok'tan, Almanca aslı altta. `#terms` ile doğrudan açılır (/msc-computer-science/#terms). Bu dönem tarihi olmayan bir modül kitapçığa göre başka dönemdeyse listede "Bu dönem yok, sonraki: SoSe 2027" yazar
- Seçimleri `.ics` olarak dışa aktarma (Google/Apple Calendar)
- Dönem içinde haftalık programı değişen dersler (eCampus'ta aynı grupta farklı tarih aralıklı seriler, ör. 59865 18.01'den itibaren başka günlerde): dönem tarih aralıklarına (faz) bölünür, takvim bir aralığı gösterir, üstte değişiklik notu ve aralık seçici çıkar (açılışta bugünün aralığı, Berlin saati). Çakışmalar aralık içinde hesaplanır; ders detayında her serinin tarihi yazar. Kurallar `site/js/schedule.js` (`seriesWeeks`, `computePhases`), istatistik `node scraper/phases-stats.js`
- Seçimler tarayıcıda (localStorage) saklanır
- Arkadaşlarla paylaşma ve karşılaştırma (hesap yok): "Arkadaşlarınla karşılaştır" sekmesindeki "Linkini paylaş" butonu ad soran bir pencere açar. Pencerede linke girecek programlar seçilir, denemelik eski seçimler silinebilir. Link seçimi (ad, program ve `state.modules`) sıkıştırılmış olarak taşır (`/<program>/#share=...`); sunucuda hiçbir şey saklanmaz. Linki açan kişide arkadaş `ders-programi:friends` içine eklenir (aynı ad tekrar gelirse güncellenir); başka bir programda seçimi varsa sayfa onun programına (`#friends`) döner. "Arkadaşlarınla karşılaştır" sekmesi bugünün haftasını gösterir: kendi derslerin gri, her arkadaşla birlikte boş olduğun saatler o arkadaşın renginde ayrı bir sütunda, herkesin boş olduğu aralıklar yeşil çerçeveyle. Arkadaşlar "Çıkar/Ekle" ile karşılaştırmadan çıkarılıp geri eklenir. Mantık `site/js/share.js`, testler `test/share.test.js`

## Çalıştırma

```sh
npm install
npm run serve        # site/ klasörünü http://localhost:3000 adresinde açar
```

Yerelde program `?p=` ile seçilir (ör. http://localhost:3000/?p=bsc-informatik); parametre yoksa Master Informatik açılır. Yayında her program kendi yolundadır (`/bsc-informatik/`). `index.html` dosyasını doğrudan `file://` ile açmak çalışmaz, çünkü tarayıcı `data/<program>.json` dosyasını fetch ile okur.

## Yayın

Site https://spacedevelopers.net/ adresinde Cloudflare Workers (static assets, `wrangler.jsonc`) ile yayınlanır. `deploy/build.js` her programı `dist/` içinde kendi yoluna (`/msc-informatik/`, `/bsc-elektrotechnik/` ...) koyar; `/api/*` istekleri geri bildirim formu için `worker/` içindeki Worker'a gider. Yayını yalnızca proje sahibi yapar (`HOST=<sunucu> ./deploy/deploy.sh`); katkı vermek için buna gerek yok.

eCampus'a otomatik istek atılmaz; veri yalnızca elle güncellenir. eCampus eksik veri döndürürse o programın eski verisi korunur.

## Veriyi güncelleme

```sh
npm run scrape            # önbellekteki sayfaları kullanır (scraper/.cache)
npm run scrape -- --fresh # her şeyi eCampus'tan yeniden çeker
npm run scrape -- --only=msc-informatik,bsc-informatik  # sadece bu programlar
npm run scrape -- --list  # sadece bulunan programları listeler
node scraper/offerings.js --apply  # modül kitapçığından dönem bilgisini çeker, site/data/<program>.json içine yazar (eCampus'a istek atmaz)
```

Scraper, katalog ağacını eCampus'un "Teilbaum aufklappen" butonuyla tek istekte açar. Sonra her dersin detay sayfasından terminleri, her modülün "Zuordnungsspezifische Leistungsinformationen" sekmesinden de ECTS değerini okur. Her programı `site/data/<program>.json`, program listesini `site/data/programs.json` dosyasına yazar. Dönem `scraper/scrape.js` içindeki `PERIOD`, programa özel kurallar `PROGRAM_RULES` içindedir. Birden çok programda geçen ders sayfaları bir kez çekilir.

Veri Grok CLI ile de doğrulanır: her dersin ham eCampus tablosu ile ayrıştırılmış hali (ve sitede görünen oda) paketler halinde Grok'a verilir, farklar raporlanır.

## Test

```sh
npm test
```

## Yapı

```
scraper/http.js     cookie tutan HTTP oturumu + JSF form alanları
scraper/parse.js    HTML ayrıştırıcıları (ağaç, ders detayı, ECTS)
scraper/catalog.js  ağaç satırlarından modül/ders/alan yapısı, kategori eşlemesi
scraper/translations.js İngilizce isimler, kategoriler, "birini seç" modülleri
scraper/handbook.js Modulhandbuch listesi: modül kodları ve resmi isimler
scraper/programs.js FB 16 programlarını bulur, en güncel PO'yu seçer, URL yolları
scraper/translations-fb16.json diğer programların İngilizce isimleri (Grok taslağı, gözden geçirildi)
scraper/scrape.js   giriş noktası
deploy/             yayın: build.js (dist/), publish.sh, deploy.sh (yalnızca proje sahibi)
site/js/schedule.js seçim, çakışma, ECTS, filtre, takvim yerleşimi (saf fonksiyonlar)
site/js/ics.js      iCalendar üretimi
site/js/app.js      arayüz
test/               node --test testleri ve gerçek sayfalardan alınmış fixture'lar
```

## Katkı / Contributing

Proje açık kaynak; katkılar (eksik program kuralları, çeviriler, hata düzeltmeleri) memnuniyetle karşılanır. Ayrıntılar [CONTRIBUTING.md](CONTRIBUTING.md) içinde.

Open source, contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). This is a volunteer student project, not an official Uni Kassel service.

## Lisans / License

Kod [MIT](LICENSE) lisanslıdır. `site/data/` ve `scraper/` altındaki ders verileri Uni Kassel eCampus ve modül kitapçıklarından derlenmiştir; bu verilerin hakları ilgili kaynaklara aittir.

Code is [MIT](LICENSE) licensed. Course data in `site/data/` and `scraper/` is compiled from Uni Kassel eCampus and module handbooks; rights to that data remain with its sources.

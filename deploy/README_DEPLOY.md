# 🚗 Ewidencja Przebiegu Pojazdów — Instrukcja Wdrożenia

Kompletna aplikacja webowa do prowadzenia ewidencji przebiegu pojazdów zgodnie z polskim prawem podatkowym.

---

## 📦 Zawartość paczki

```
ewidencja-przebiegu/
├── app/                    # Kod źródłowy aplikacji (Next.js 14)
├── components/             # Komponenty UI
├── lib/                    # Biblioteki pomocnicze
├── prisma/                 # Schema bazy danych
├── scripts/                # Skrypty (seed, itp.)
├── public/                 # Pliki statyczne
├── Dockerfile              # Obraz Docker
├── docker-compose.yml      # Orkiestracja kontenerów
├── .env.example            # Przykładowa konfiguracja
├── entrypoint.sh           # Skrypt startowy kontenera
└── package.json            # Zależności
```

---

## 🚀 Szybki start (Docker)

### Wymagania
- Docker 20+ i Docker Compose v2
- Minimum 2 GB RAM
- 5 GB wolnego miejsca na dysku

### Kroki

```bash
# 1. Rozpakuj archiwum
tar -xzf ewidencja-przebiegu.tar.gz
cd ewidencja-przebiegu

# 2. Skonfiguruj zmienne środowiskowe
cp .env.example .env
nano .env   # <-- UZUPEŁNIJ WARTOŚCI!

# 3. Uruchom kontenery
docker-compose up -d --build

# 4. Poczekaj ~60s na build, potem sprawdź logi
docker-compose logs -f app

# 5. Aplikacja dostępna pod http://localhost:3000
```

### Domyślne konto administratora
- **Email:** admin@example.com (lub co ustawisz w .env jako ADMIN_EMAIL)
- **Hasło:** ZmienToHaslo123! (lub ADMIN_PASSWORD z .env)

---

## ⚙️ Konfiguracja (.env)

### Wymagane zmienne

| Zmienna | Opis | Przykład |
|---------|------|----------|
| `DB_PASSWORD` | Hasło do bazy danych | `MojeBezpieczneHaslo2024!` |
| `NEXTAUTH_SECRET` | Sekret JWT (min. 32 znaki) | Wygeneruj: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL aplikacji | `https://ewidencja.mojafirma.pl` |

### Opcjonalne — AI do parsowania wyciągów

| Zmienna | Opis | Domyślnie |
|---------|------|-----------|
| `OPENAI_API_KEY` | Klucz API (OpenAI lub kompatybilny) | *(brak)* |
| `OPENAI_API_URL` | URL endpointu API | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Model do użycia | `gpt-4o-mini` |

> 💡 **Bez klucza API** aplikacja działa normalnie — jedynie parsowanie wyciągów bankowych PDF będzie niedostępne. Faktury KSeF i ewidencja działają bez AI.

> 💡 **Alternatywy dla OpenAI:** Możesz użyć dowolnego API kompatybilnego z OpenAI:
> - **Ollama** (lokalne, darmowe): `OPENAI_API_URL=http://host.docker.internal:11434/v1`
> - **Azure OpenAI**: Ustaw odpowiedni URL i klucz
> - **LM Studio**: `OPENAI_API_URL=http://host.docker.internal:1234/v1`

---

## 📂 Wdrożenie bez Dockera

### Wymagania
- Node.js 18+
- PostgreSQL 14+
- Yarn

### Kroki

```bash
cd ewidencja-przebiegu

# 1. Zainstaluj zależności
yarn install

# 2. Skonfiguruj zmienne środowiskowe
cp .env.example .env
nano .env
# Ustaw DATABASE_URL bezpośrednio:
# DATABASE_URL="postgresql://user:password@localhost:5432/ewidencja"

# 3. Wygeneruj klienta Prisma i utwórz tabele
yarn db:generate
yarn db:push

# 4. Załaduj dane początkowe
yarn db:seed

# 5. Zbuduj aplikację
yarn build

# 6. Uruchom
yarn start

# Lub skrót (kroki 1-4):
yarn setup
yarn build
yarn start
```

### Generowanie PDF (opcjonalne)
Do generowania raportów PDF potrzebujesz Chromium/Puppeteer:
```bash
yarn add puppeteer
# lub na Linux:
sudo apt install chromium-browser
yarn add puppeteer-core
```

---

## 🔒 Bezpieczeństwo produkcyjne

1. **Zmień domyślne hasła** w `.env`
2. **Wygeneruj nowy NEXTAUTH_SECRET**: `openssl rand -base64 32`
3. **HTTPS**: Użyj reverse proxy (nginx/Caddy) z certyfikatem SSL
4. **Firewall**: Ogranicz port 5432 (baza danych) tylko do localhost
5. **Backup**: Automatyczny backup bazy uruchamia się co 24h w kontenerze `db-backup`

### Przykładowy nginx reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name ewidencja.mojafirma.pl;

    ssl_certificate /etc/letsencrypt/live/ewidencja.mojafirma.pl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ewidencja.mojafirma.pl/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name ewidencja.mojafirma.pl;
    return 301 https://$host$request_uri;
}
```

---

## 💾 Backup i przywracanie

### Automatyczny backup (Docker)
Kontener `db-backup` automatycznie tworzy kopie co 24h.
Przechowuje ostatnie 30 kopii w wolumenie `backups_data`.

### Ręczny backup

```bash
# Eksport bazy
docker-compose exec db pg_dump -U ewidencja -Fc ewidencja_przebiegu > backup_$(date +%Y%m%d).sql

# Eksport JSON z aplikacji (wszystkie dane)
curl -H "Cookie: ..." http://localhost:3000/api/backup/export > backup.json
```

### Przywracanie

```bash
# Z dump SQL
docker-compose exec -T db pg_restore -U ewidencja -d ewidencja_przebiegu --clean < backup_20240101.sql

# Z JSON (przez interfejs aplikacji)
# Ustawienia → Backup → Import JSON
```

---

## 🛠️ Rozwiązywanie problemów

| Problem | Rozwiązanie |
|---------|------------|
| Aplikacja nie startuje | Sprawdź logi: `docker-compose logs app` |
| Błąd połączenia z bazą | Sprawdź DATABASE_URL i czy kontener db działa |
| Parsowanie PDF nie działa | Ustaw OPENAI_API_KEY w .env |
| Raporty PDF puste | Zainstaluj puppeteer lub chromium |
| Port 3000 zajęty | Zmień APP_PORT w .env |

### Logi
```bash
# Wszystkie kontenery
docker-compose logs -f

# Tylko aplikacja
docker-compose logs -f app

# Baza danych
docker-compose logs -f db
```

---

## 📧 Wsparcie

W razie problemów przejrzyj logi aplikacji i bazy danych.
Wszystkie dane są przechowywane w wolumenach Docker, więc przebudowanie kontenerów nie powoduje utraty danych.

---

## 📋 Funkcje aplikacji

- ✅ Ewidencja przebiegu pojazdów (zgodna z ustawą)
- ✅ Zarządzanie pojazdami (do 10)
- ✅ Zarządzanie użytkownikami (do 10)
- ✅ Integracja z KSeF (Krajowy System e-Faktur)
- ✅ Import wyciągów bankowych PKO BP (PDF)
- ✅ Weryfikacja spalania (10-14 l/100km)
- ✅ Raporty PDF
- ✅ Eksport/import danych (JSON)
- ✅ Automatyczne kopie zapasowe bazy danych
- ✅ System logowania z rolami (Admin/Użytkownik)

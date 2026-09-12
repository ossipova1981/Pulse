# Планер

Локальный планер: дни, недели, годы, привычки и блок «Дейли». Данные хранятся только на устройстве.

## Десктоп (Mac / Windows / Linux)

```bash
npm install
npm run desktop
```

Сборка установщика:

```bash
npm run desktop:build
```

Готовые файлы — в папке `release/`.

Или двойной клик по `start.command` (Mac).

## Android

Нужны: Android Studio и Android SDK.

```bash
npm install
npm run android
```

В Android Studio: **Run** на телефоне или эмуляторе.

После правок в `app.js` / `styles.css`:

```bash
node scripts/copy-www.cjs && npx cap sync android
```

## iOS (iPhone / iPad)

Нужны: Xcode и CocoaPods.

```bash
sudo gem install cocoapods   # один раз
npm install
npm run ios
```

В Xcode: выберите симулятор или свой iPhone → **Run**.

После правок:

```bash
node scripts/copy-www.cjs && npx cap sync ios
cd ios/App && pod install
```

## Как устроено

| Платформа | Технология |
|-----------|------------|
| Веб / основа | `index.html`, `app.js`, `styles.css` |
| Десктоп | Electron |
| Android / iOS | Capacitor (WebView с тем же интерфейсом) |

## Облако Mail.ru

В боковом меню → **Облако Mail.ru**:

1. Создайте [пароль внешнего приложения](https://id.mail.ru/security) с доступом к Облаку (лучше полный доступ к Почте/Облаку/Календарю).
2. Введите email и этот пароль, включите «Синхронизировать это устройство», нажмите **Сохранить**.
3. Данные пишутся в файл `Pulse/planer.json` в Облаке. Побеждает более новая версия (last-write-wins).

Работает в **десктопе (Electron)** и **Android/iOS**. В обычном браузере WebDAV Mail.ru обычно блокируется CORS.

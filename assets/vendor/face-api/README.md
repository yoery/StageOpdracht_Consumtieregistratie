# face-api (meegeleverd)

Deze map bevat de bibliotheek en modellen voor de demo gezichtsherkenning
(`assets/js/FaceRecognitionDemo.js`). Ze staan in het project zelf, zodat de website tijdens
gebruik geen code of gegevens van een externe server haalt (zie TO, hoofdstuk 13).

- Pakket: `@vladmandic/face-api`, versie **1.7.15** (MIT-licentie, zie `LICENSE`)
- Bron: https://www.npmjs.com/package/@vladmandic/face-api/v/1.7.15 (map `dist/` en `model/`)
- Alleen de drie modellen die de demo gebruikt: tiny face detector, face landmark 68 tiny en face recognition.
- `face-api.esm.js` bevat ook een ingebouwde kopie van **TensorFlow.js 4.22.0** van Google
  (Apache-licentie 2.0, zie `LICENSE-TENSORFLOWJS`). Die licentie vraagt dat de licentietekst en
  de copyright bij het verspreiden worden meegeleverd.

## Onderhoud

De GitHub-repository van face-api (`vladmandic/face-api`) is gearchiveerd: er komen geen nieuwe
versies of beveiligingsupdates meer. Versie 1.7.15 is de laatste. Op het moment van opnemen
waren er geen bekende kwetsbaarheden voor deze versie of voor de ingebouwde TensorFlow.js.
De bibliotheek is alleen bedoeld voor de demo gezichtsherkenning. Kies voor productie een
bibliotheek die nog wordt onderhouden (zie TO, hoofdstuk 13 en 16).

## Controlegetallen (SHA-256)

Met deze getallen is te controleren dat de bestanden niet zijn veranderd. De test
`tests/beveiliging-config.test.js` rekent ze opnieuw uit en vergelijkt ze met deze lijst.
Werk je de bibliotheek bij, pas dan ook deze lijst aan.

| Bestand | SHA-256 |
|---|---|
| `face-api.esm.js` | `14f0e9813f6d9f14a9cdafb6543a74835ebb13085090e2942310a7a737f55d9a` |
| `tiny_face_detector_model-weights_manifest.json` | `5d1af4849ac48d5b985f4a9b16010c512353ddd6fcc63d50fd0bc9e9e64296e5` |
| `tiny_face_detector_model.bin` | `b7503ce7df31039b1c43316a9b865cab6a70dd748cc602d3fa28b551503c3871` |
| `face_landmark_68_tiny_model-weights_manifest.json` | `9a1a5dd19fd814fd5095c3cb58f8e0d3193b8c5b9a6715b30a69d559aea31ad4` |
| `face_landmark_68_tiny_model.bin` | `b98e9f2f7da76f8a6dda9741a36ed485b224b889d552de2b2c1bb16217f67bfc` |
| `face_recognition_model-weights_manifest.json` | `cbaffa501b0b9275a12b63357a6843e7e30c054e1c9151e1a5f879b26e32986b` |
| `face_recognition_model.bin` | `b413e420d6840b2775fba32008db6f3cddb07d485967fb42cfcf379c16a8c589` |
| `LICENSE` | `9a3442b79acaf4fbc7c2e07b7e2d8f84af9bb3871bf08a69d80304ab00640e9a` |
| `LICENSE-TENSORFLOWJS` | `2f859b1ef1d3df1b2718ee8fc6b9dd972b0ca2849d790cdd01fbb0bd0a46b99d` |

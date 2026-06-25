# App-Store-Upload per Kommandozeile (Watch-only-Workaround)

Wenn Xcode im „Distribute App"-Dialog **kein „App Store Connect"** anbietet (passiert
bei reinen watchOS-Apps ohne iOS-Host), kann `xcodebuild` den Build trotzdem mit
`method app-store-connect` hochladen.

## 1. Archiv-Pfad finden
Xcode → Organizer → Archive → Rechtsklick aufs Archiv → **„Show in Finder"**.
Pfad endet auf `.../PumpfoilWatch.xcarchive` (z. B. unter
`~/Library/Developer/Xcode/Archives/<Datum>/`).

## 2. Direkt hochladen
```sh
cd watch-apple
xcodebuild -exportArchive \
  -archivePath "<PFAD>/PumpfoilWatch.xcarchive" \
  -exportOptionsPlist exportOptions.plist \
  -exportPath /tmp/pumpfoil-export \
  -allowProvisioningUpdates
```
`destination=upload` in der plist lädt direkt zu App Store Connect.

**Auth:** Klappt die Anmeldung nicht automatisch, einen App-Store-Connect-API-Key
anlegen (App Store Connect → Benutzer und Zugriff → Integrationen → Schlüssel,
Rolle „App Manager") und ergänzen:
```sh
  -authenticationKeyPath ~/private_keys/AuthKey_XXXXXX.p8 \
  -authenticationKeyID XXXXXX \
  -authenticationKeyIssuerID <issuer-uuid>
```

## 3. Falls Upload nicht direkt geht: exportieren + Transporter
In `exportOptions.plist` `destination` auf `export` ändern, dann:
```sh
xcodebuild -exportArchive -archivePath "<PFAD>/PumpfoilWatch.xcarchive" \
  -exportOptionsPlist exportOptions.plist -exportPath /tmp/pumpfoil-export \
  -allowProvisioningUpdates
```
Die erzeugte `.ipa` aus `/tmp/pumpfoil-export` per **Transporter**-App (Mac App Store)
hochladen.

## Wenn `xcodebuild` „app-store-connect not supported" o. ä. meldet
Dann ist die reine Watch-only-App ohne iOS-Host nicht store-fähig → wir bauen eine
schlanke iOS-Begleit-App ins Projekt (Weg B). Melde die Fehlermeldung.

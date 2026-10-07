import { AbilityConstant, UIAbility, Want, abilityAccessCtrl, Permissions } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { Recorder } from '../common/Recorder';

/**
 * Berechtigungen, die der Nutzer erteilen muss (Standort, Puls). Der Beschleunigungssensor ist
 * system_grant und braucht keinen Dialog. Fehlt eine, nimmt die App trotzdem auf, was geht —
 * und die Fehlerzaehler auf der Uhr zeigen, was fehlt (Berechtigungen nie stumm scheitern).
 */
const FRAGEN: Permissions[] = [
  'ohos.permission.APPROXIMATELY_LOCATION',
  'ohos.permission.LOCATION',
  'ohos.permission.READ_HEALTH_DATA'
];

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    Recorder.get().init(this.context);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    abilityAccessCtrl.createAtManager().requestPermissionsFromUser(this.context, FRAGEN)
      .catch((e: BusinessError) => {
        console.error('Pumpfoil Berechtigungen ' + e.code);
      });
    windowStage.loadContent('pages/Index', (err: BusinessError) => {
      if (err && err.code) {
        console.error('Pumpfoil Seite ' + err.code);
      }
    });
  }

  onDestroy(): void {
    Recorder.get().ende();
  }
}

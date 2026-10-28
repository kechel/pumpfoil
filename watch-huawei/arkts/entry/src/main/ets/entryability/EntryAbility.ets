import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { Recorder } from '../common/Recorder';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    Recorder.get().init(this.context);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // Erst nach der Zustimmung zum Datenschutz-Hinweis (Recorder.datenschutzAnnehmen fragt dann selbst).
    if (Recorder.get().datenschutzOk()) {
      Recorder.get().berechtigungenFragen();
    }
    windowStage.loadContent('pages/Index', (err: BusinessError) => {
      if (err && err.code) {
        console.error('Pumpfoil Seite ' + err.code);
      }
    });
  }

  onDestroy(): void {
    Recorder.get().appVerlassen();   // vor ende(): braucht Modus + Token
    Recorder.get().ende();
  }
}

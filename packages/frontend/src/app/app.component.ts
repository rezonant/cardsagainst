import { Component } from '@angular/core';
import { CardsAgainstService } from '@cardsagainst/backend';
import { RPCSession } from '@astronautlabs/webrpc';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  async ngOnInit() {
    this.session = await RPCSession.connect(`ws://localhost:3044`);
    this.service = await this.session.getRemoteService(CardsAgainstService);
  }

  session: RPCSession | undefined;
  service: CardsAgainstService | undefined;

  title = 'frontend';
}

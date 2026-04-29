/**
 * First Launch Service.
 * Detects whether this is the first time the app has been launched,
 * so we can show a permission guide to new users.
 */

import { credentialStore } from '../config/credential-store';

const FIRST_LAUNCH_KEY = 'sarah.hasCompletedFirstLaunch';

export class FirstLaunchService {
  isFirstLaunch(): boolean {
    return credentialStore.get(FIRST_LAUNCH_KEY) == null;
  }

  markComplete(): void {
    credentialStore.set(FIRST_LAUNCH_KEY, 'true');
  }
}

export const firstLaunchService = new FirstLaunchService();

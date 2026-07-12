import { Context, CanActivate } from '@eleven-am/pondsocket-nest';

import { AuthorizationService } from './index';

export declare class AuthorizationSocketGuard implements CanActivate {
    constructor (authorizationService: AuthorizationService);

    canActivate (context: Context): Promise<boolean>;
}

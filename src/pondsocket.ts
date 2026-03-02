import { Injectable } from '@nestjs/common';
import { Context, CanActivate } from '@eleven-am/pondsocket-nest';

import { AuthorizationService } from './authorization/authorization.service';

@Injectable()
export class AuthorizationSocketGuard implements CanActivate {
    constructor (private readonly authorizationService: AuthorizationService) {}

    canActivate (context: Context): Promise<boolean> {
        return this.authorizationService.authorize(context);
    }
}

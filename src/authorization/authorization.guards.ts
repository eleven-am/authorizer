import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { AuthorizationService } from './authorization.service';

@Injectable()
export class AuthorizationGuard implements CanActivate {
    constructor (private readonly authorizationService: AuthorizationService) {}

    canActivate (context: ExecutionContext): Promise<boolean> {
        return this.authorizationService.authorize(context);
    }
}

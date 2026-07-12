import { HttpException, Injectable } from '@nestjs/common';
import { Context, CanActivate } from '@eleven-am/pondsocket-nest';

import { AuthorizationService } from './authorization/authorization.service';

@Injectable()
export class AuthorizationSocketGuard implements CanActivate {
    constructor (private readonly authorizationService: AuthorizationService) {}

    async canActivate (context: Context): Promise<boolean> {
        try {
            return await this.authorizationService.authorize(context);
        } catch (error) {
            if (error instanceof HttpException) {
                return false;
            }

            throw error;
        }
    }
}

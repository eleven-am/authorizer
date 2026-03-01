import { Context, CanActivate } from '@eleven-am/pondsocket-nest';

import { ResolvedAbility } from './index';

export declare class AuthorizationSocketGuard implements CanActivate {
    canActivate (context: Context): Promise<boolean>;
}

export declare const CurrentSocketAbility: () => ParameterDecorator;

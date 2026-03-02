import { Context, CanActivate } from '@eleven-am/pondsocket-nest';

export declare class AuthorizationSocketGuard implements CanActivate {
    canActivate (context: Context): Promise<boolean>;
}

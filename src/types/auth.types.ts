export interface IRegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface ILoginInput {
  email: string;
  password: string;
}

export interface IAuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface IAuthResponse {
  token: string;
  user: IAuthUser;
}

export interface IJwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

import { api } from '@/services/api';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
  };
}

export interface LogoutResponse {
  message: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface RegisteredUser {
  id: number;
  username: string;
  status: string;
  email?: string | null;
}

export interface RegisterResponse {
  message: string;
  user: RegisteredUser;
}

class AuthService {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await api.post('/login', credentials);
    return response.data.data;
  }

  async logout(): Promise<LogoutResponse> {
    const response = await api.post('/logout');
    return response.data;
  }

  async register(payload: RegisterRequest): Promise<RegisterResponse> {
    const response = await api.post('/register', payload);
    return response.data.data;
  }
}

export const authService = new AuthService();

import type { Model } from 'mongoose';

import { UserModel, type User, type UserDocument } from '../../database/models/user';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCredentials extends UserProfile {
  passwordHash: string;
}

export interface CreateUserRecord {
  name: string;
  email: string;
  passwordHash: string;
}

export interface UserRepository {
  create(input: CreateUserRecord): Promise<UserProfile>;
  findByEmail(email: string): Promise<UserCredentials | null>;
  findById(userId: string): Promise<UserProfile | null>;
}

function toUserProfile(user: UserDocument): UserProfile {
  return {
    id: user._id.toHexString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export class MongooseUserRepository implements UserRepository {
  public constructor(private readonly userModel: Model<User> = UserModel) {}

  public async create(input: CreateUserRecord): Promise<UserProfile> {
    const user = await this.userModel.create(input);
    return toUserProfile(user);
  }

  public async findByEmail(email: string): Promise<UserCredentials | null> {
    const user = await this.userModel.findOne({ email }).select('+passwordHash').exec();

    if (!user) {
      return null;
    }

    return {
      ...toUserProfile(user),
      passwordHash: user.passwordHash,
    };
  }

  public async findById(userId: string): Promise<UserProfile | null> {
    const user = await this.userModel.findById(userId).exec();
    return user ? toUserProfile(user) : null;
  }
}

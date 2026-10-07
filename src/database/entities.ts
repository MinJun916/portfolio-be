import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('site_content')
@Check('CHK_site_singleton', 'id = 1')
@Check('CHK_site_version', 'version > 0')
export class SiteContent {
  @PrimaryColumn('integer') id: number;
  @Column('jsonb') data: Record<string, unknown>;
  @Column('integer', { default: 1 }) version: number;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('admin_accounts')
export class AdminAccount {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('text', { unique: true }) email: string;
  @Column('text') passwordHash: string;
  @Column('boolean', { default: true }) isActive: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('admin_sessions')
@Index('IDX_admin_sessions_expires', ['expiresAt'])
export class AdminSession {
  @PrimaryColumn('text') tokenHash: string;
  @Column('uuid') adminId: string;
  @ManyToOne(() => AdminAccount, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'adminId',
    foreignKeyConstraintName: 'FK_admin_sessions_admin',
  })
  admin: AdminAccount;
  @Column('timestamptz') expiresAt: Date;
}

abstract class OrderedContent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('boolean', { default: false }) isPublished: boolean;
  @Column('integer', { default: 0 }) sortOrder: number;
  @Column('integer', { default: 1 }) version: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('experiences')
@Check('CHK_experiences_order', '"sortOrder" BETWEEN 0 AND 100000')
@Check('CHK_experiences_version', 'version > 0')
@Index('IDX_experiences_public_order', ['isPublished', 'sortOrder', 'id'])
export class Experience extends OrderedContent {
  @Column('text') title: string;
  @Column('text') organization: string;
  @Column('text') period: string;
  @Column('text') iconKey: string;
  @Column('text', { array: true, default: () => "'{}'" })
  responsibilities: string[];
  @Column('text', { array: true, default: () => "'{}'" })
  skills: string[];
}

@Entity('tech_groups')
@Check('CHK_tech_groups_order', '"sortOrder" BETWEEN 0 AND 100000')
@Check('CHK_tech_groups_version', 'version > 0')
@Index('IDX_tech_groups_public_order', ['isPublished', 'sortOrder', 'id'])
export class TechGroup extends OrderedContent {
  @Column('text') title: string;
  @Column('jsonb', { default: () => "'[]'" }) items: {
    name: string;
    iconName?: string;
  }[];
}

@Entity('projects')
@Check('CHK_projects_category', "category IN ('major', 'side', 'etc')")
@Check(
  'CHK_projects_template',
  "template IN ('case-study', 'changelog', 'none')",
)
@Check('CHK_projects_order', '"sortOrder" BETWEEN 0 AND 100000')
@Check('CHK_projects_version', 'version > 0')
@Index('IDX_projects_public_order', ['isPublished', 'sortOrder', 'id'])
export class Project extends OrderedContent {
  @Column('text', { unique: true }) slug: string;
  @Column('text') title: string;
  @Column('text') category: 'major' | 'side' | 'etc';
  @Column('text') template: 'case-study' | 'changelog' | 'none';
  @Column('text', { nullable: true }) subtitle: string | null;
  @Column('text', { nullable: true }) description: string | null;
  @Column('text', { nullable: true }) imageSrc: string | null;
  @Column('text', { nullable: true }) logoSrc: string | null;
  @Column('text', { nullable: true }) role: string | null;
  @Column('text', { nullable: true }) period: string | null;
  @Column('text', { nullable: true }) repository: string | null;
  @Column('jsonb', { default: () => "'[]'" }) links: {
    type: 'fe' | 'be' | 'demo' | 'api';
    href: string;
  }[];
  @Column('text', { array: true, default: () => "'{}'" })
  keywords: string[];
  @Column('text', { array: true, default: () => "'{}'" })
  techStack: string[];
  @Column('jsonb', { default: () => "'{}'" }) content: Record<string, unknown>;
  @Column('jsonb', { default: () => "'{}'" }) seo: {
    title?: string;
    description?: string;
  };
  @Column('boolean', { default: false }) showOnHome: boolean;
}

<script lang="ts">
  import { t, formatDate, formatNumber } from '$lib/i18n';
  import { page } from '$app/state';

  // 模拟用户数据
  const mockUser = {
    name: 'John Doe',
    email: 'john@example.com',
    bio: 'Software developer from Shanghai',
    joinedAt: new Date('2023-01-15'),
    posts: 42,
    followers: 1234,
  };
</script>

<div class="user-profile">
  <h1>{t('user.profile')}</h1>

  <div class="info-card">
    <p class="user-id">{t('user.id', { id: page.params.id })}</p>

    <div class="field">
      <label>{t('user.name')}</label>
      <span>{mockUser.name}</span>
    </div>

    <div class="field">
      <label>{t('user.email')}</label>
      <span>{mockUser.email}</span>
    </div>

    <div class="field">
      <label>{t('user.bio')}</label>
      <span>{mockUser.bio}</span>
    </div>

    <div class="stats">
      <span>{t('user.joined', { date: formatDate(mockUser.joinedAt) })}</span>
      <span>{t('user.posts', { count: formatNumber(mockUser.posts) })}</span>
      <span>{t('user.followers', { count: formatNumber(mockUser.followers) })}</span>
    </div>
  </div>
</div>

<style>
  .user-profile {
    max-width: 600px;
    margin: 0 auto;
  }

  .info-card {
    background: var(--card-bg, #f9f9f9);
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .user-id {
    font-size: 0.875rem;
    color: #666;
    margin-bottom: 1rem;
  }

  .field {
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field label {
    font-weight: 600;
    font-size: 0.875rem;
    color: #444;
  }

  .stats {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
    font-size: 0.875rem;
    color: #666;
  }
</style>

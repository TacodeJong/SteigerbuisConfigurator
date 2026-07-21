export type AppRoute =
  | { name: 'app' }
  | { name: 'gallery' }
  | { name: 'tutorials' }
  | { name: 'favourites' }
  | { name: 'feed' }
  | { name: 'model'; id: string }
  | { name: 'profile'; id: string }
  | { name: 'upgrade' }
  | { name: 'admin' }
  | { name: 'privacy' }
  | { name: 'terms' }

export function parseRoute(search = window.location.search, hash = window.location.hash): AppRoute {
  const params = new URLSearchParams(search)
  const modelId = params.get('model')
  if (modelId) return { name: 'model', id: modelId }
  const profileId = params.get('profile')
  if (profileId) return { name: 'profile', id: profileId }
  if (params.get('view') === 'gallery' || hash === '#gallery') return { name: 'gallery' }
  if (params.get('view') === 'tutorials' || hash === '#tutorials') return { name: 'tutorials' }
  if (params.get('view') === 'favourites' || hash === '#favourites') return { name: 'favourites' }
  if (params.get('view') === 'feed' || hash === '#feed') return { name: 'feed' }
  if (params.get('view') === 'upgrade' || hash === '#upgrade') return { name: 'upgrade' }
  if (params.get('view') === 'admin' || hash === '#admin') return { name: 'admin' }
  if (params.get('view') === 'privacy' || hash === '#privacy') return { name: 'privacy' }
  if (params.get('view') === 'terms' || hash === '#terms') return { name: 'terms' }
  return { name: 'app' }
}

export function navigate(route: AppRoute): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('model')
  url.searchParams.delete('profile')
  url.searchParams.delete('view')
  switch (route.name) {
    case 'app':
      break
    case 'gallery':
      url.searchParams.set('view', 'gallery')
      break
    case 'tutorials':
      url.searchParams.set('view', 'tutorials')
      break
    case 'favourites':
      url.searchParams.set('view', 'favourites')
      break
    case 'feed':
      url.searchParams.set('view', 'feed')
      break
    case 'upgrade':
      url.searchParams.set('view', 'upgrade')
      break
    case 'admin':
      url.searchParams.set('view', 'admin')
      break
    case 'privacy':
      url.searchParams.set('view', 'privacy')
      break
    case 'terms':
      url.searchParams.set('view', 'terms')
      break
    case 'model':
      url.searchParams.set('model', route.id)
      break
    case 'profile':
      url.searchParams.set('profile', route.id)
      break
  }
  window.history.pushState({}, '', url.toString())
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function modelShareUrl(id: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('model', id)
  return url.toString()
}

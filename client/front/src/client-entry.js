import './assets/js/base'
import Vue from 'vue'
import { app, appOption, router, store, isProd } from './main'
import clientGoogleAnalyse from './utils/clientGoogleAnalyse'
import registerServiceWorker from './utils/serviceWorker'

const callback = isProd ? setTimeout : router.onReady.bind(router)
if (isProd) {
  store.state.isLoadingAsyncComponent = true
}
// setTimeout to make the following chunks loaded to webpack modules,
// therefore webpackJsonp won't create script to head to send a request
callback(() => {
  if (isProd) store.state.isLoadingAsyncComponent = false
  let realApp = isProd ? new Vue(appOption) : app
  // SSR can not render hash since browsers even don't send it
  // therefore we must hydrate the hash for the client side vue-router,
  // which is important for hash anchor jump especially for Table Of Contents(toc)
  window.__INITIAL_STATE__.route.hash = window.location.hash
  store.replaceState(window.__INITIAL_STATE__)
  realApp.$mount('#app')

  // service worker
  if (isProd) registerServiceWorker(store.state)

  router.beforeEach((to, from, next) => {
    // required by a new hash, just navigate to it
    if (to.path === from.path && to.hash !== from.hash) {
      return next()
    }
    let loadingPromise = store.dispatch('START_LOADING')
    let endLoadingCallback = () => {
      return loadingPromise.then(interval => {
        clearInterval(interval)
        store.dispatch('SET_PROGRESS', 100)
        next()
      })
    }

    // there must be a matched component according
    // to routes definition
    let component = router.getMatchedComponents(to.fullPath)[0]

    // if it's an async component, resolve it and check the preFetch
    // which can avoid clock when routes change
    if (typeof component === 'function' && !component.options) {
      return new Promise((resolve, reject) => {
        const _resolve = realComponent => {
          resolve(realComponent)
        }
        // for general component
        let res = component(_resolve)
        // for factory component
        if (res && res.then) {
          res.then(_resolve)
        }
      }).then(component => letsGo(component, store, to, endLoadingCallback))
    }
    // component is there, check the preFetch
    letsGo(component, store, to, endLoadingCallback)
  })

  function letsGo (component, store, to, endLoadingCallback) {
    if (component && component.preFetch) {
      // component need fetching some data before navigating to it
      return component.preFetch(store, to, endLoadingCallback).catch(err => {
        console.error(Date.now().toLocaleString(), err)
      })
    } else {
      // component's a static page and just navigate to it
      endLoadingCallback()
    }
  }

  // send user info if google analytics code is provided.
  if (window.__INITIAL_STATE__.siteInfo) {
    let analyzeCode = window.__INITIAL_STATE__.siteInfo.analyzeCode
    if (analyzeCode && analyzeCode.value !== '') {
      router.afterEach((to, from) => {
        // should delay it to get the correct title generated by vue-meta
        from.name && setTimeout(() => {
          clientGoogleAnalyse(to.path)
        })
      })
    }
  }
})

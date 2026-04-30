import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import articleReducer from './slices/articleSlice'
import rssReducer from './slices/rssSlice'
import categoryReducer from './slices/categorySlice'
import trendsReducer from './slices/trendsSlice'
import webstoriesReducer from './slices/webstorySlice'
import brandingReducer from './slices/brandingSlice'
import dashboardReducer from './slices/dashboardSlice'
import videoStudioReducer from './slices/videoStudioSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    articles: articleReducer,
    rss: rssReducer,
    categories: categoryReducer,
    trends: trendsReducer,
    webstories: webstoriesReducer,
    branding: brandingReducer,
    dashboard: dashboardReducer,
    videoStudio: videoStudioReducer,
  },
})


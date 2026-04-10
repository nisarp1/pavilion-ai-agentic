import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import articleReducer from './slices/articleSlice'
import rssReducer from './slices/rssSlice'
import categoryReducer from './slices/categorySlice'
import trendsReducer from './slices/trendsSlice'
import webstoriesReducer from './slices/webstorySlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    articles: articleReducer,
    rss: rssReducer,
    categories: categoryReducer,
    trends: trendsReducer,
    webstories: webstoriesReducer,
  },
})


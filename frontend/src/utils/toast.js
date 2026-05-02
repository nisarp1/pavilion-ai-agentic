import toast from 'react-hot-toast'

export const showSuccess = (msg) => toast.success(msg, { duration: 3000 })
export const showError = (msg) => toast.error(msg, { duration: 5000 })
export const showInfo = (msg) => toast(msg, { duration: 3000 })
export const showLoading = (msg) => toast.loading(msg)
export const dismissToast = (id) => toast.dismiss(id)

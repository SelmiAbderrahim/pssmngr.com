import React from 'react'

interface ButtonProps {
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
}

export const Button: React.FC<ButtonProps> = ({ children, disabled = false, onClick }) => {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      role="button"
    >
      {children}
    </button>
  )
}
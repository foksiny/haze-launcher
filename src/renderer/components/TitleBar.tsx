import { APP_NAME } from '../../shared/constants'
import logo from '../assets/logo.png' // I'll rename the generated image to logo.png later

export default function TitleBar() {
  return (
    <div className="title-bar">
      <img src={logo} alt="" className="title-bar-logo" />
      <span className="title-bar-name">{APP_NAME}</span>
      <div className="title-bar-spacer" />
      {/* 
        Windows control buttons are handled by titleBarOverlay in index.ts,
        but we leave space for them here.
      */}
      <div className="title-bar-controls" style={{ width: 135 }} />
    </div>
  )
}

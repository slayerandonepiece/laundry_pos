import Icon from './Icon';

export default function StoreDetailStub({ text }: { text: string }) {
  return <div className="card"><div className="empty">
    <span className="ic l"><Icon name="history" size="l" /></span>
    <h3>Not built yet</h3>
    <p>{text}</p>
  </div></div>;
}
